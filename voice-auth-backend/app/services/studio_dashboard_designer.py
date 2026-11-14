"""Owner-scoped Dashboard Designer definitions via the signed BEAM gateway."""
import base64
import binascii
import json
import re
import uuid

from app.clients.core_api_client import CoreApiClient
from app.services.studio_connections import _rows
from app.services.studio_object_access import _envelope
from app.services.studio_charts import get_chart


class DashboardError(ValueError):
    def __init__(self, code, status=400):
        super().__init__(code)
        self.http_status = status


def _uuid(value):
    try:
        return str(uuid.UUID(str(value)))
    except (TypeError, ValueError, AttributeError):
        raise DashboardError('DASHBOARD_ID_INVALID') from None


def validate_document(document):
    if isinstance(document, dict) and document.get('version') == 2:
        return _validate_v2(document)
    if not isinstance(document, dict) or set(document) != {'version', 'cards', 'style'} or type(document['version']) is not int or document['version'] != 1:
        raise DashboardError('DASHBOARD_DOCUMENT_INVALID')
    cards, style = document['cards'], document['style']
    if not isinstance(cards, list) or len(cards) > 40 or not isinstance(style, dict) or set(style) != {'background', 'cardBackground', 'textColor'}:
        raise DashboardError('DASHBOARD_DOCUMENT_INVALID')
    if any(not isinstance(v, str) or not re.fullmatch(r'#[0-9a-fA-F]{6}', v) for v in style.values()):
        raise DashboardError('DASHBOARD_STYLE_INVALID')
    ids = set()
    for card in cards:
        if not isinstance(card, dict) or set(card) != {'id', 'chart_id', 'title', 'background', 'x', 'y', 'w', 'h', 'mappings', 'drill_path'}:
            raise DashboardError('DASHBOARD_CARD_INVALID')
        card_id = _uuid(card['id'])
        _uuid(card['chart_id'])
        if card_id in ids:
            raise DashboardError('DASHBOARD_CARD_INVALID')
        ids.add(card_id)
        if not isinstance(card['title'], str) or len(card['title']) > 150 or not isinstance(card['background'], str) or not re.fullmatch(r'#[0-9a-fA-F]{6}', card['background']):
            raise DashboardError('DASHBOARD_CARD_INVALID')
        if any(type(card[k]) is not int for k in ('x', 'y', 'w', 'h')) or not (0 <= card['x'] <= 11 and 0 <= card['y'] <= 1000 and 2 <= card['w'] <= 12 and 2 <= card['h'] <= 20 and card['x'] + card['w'] <= 12):
            raise DashboardError('DASHBOARD_LAYOUT_INVALID')
        if not isinstance(card['mappings'], list) or len(card['mappings']) > 40 or not isinstance(card['drill_path'], list) or len(card['drill_path']) > 8:
            raise DashboardError('DASHBOARD_INTERACTION_INVALID')
        if any(not isinstance(x, str) or not x or len(x) > 128 for x in card['drill_path']) or len(set(card['drill_path'])) != len(card['drill_path']):
            raise DashboardError('DASHBOARD_INTERACTION_INVALID')
    for card in cards:
        mappings = set()
        for item in card['mappings']:
            if not isinstance(item, dict) or set(item) != {'target_card_id', 'target_column'}:
                raise DashboardError('DASHBOARD_INTERACTION_INVALID')
            target = _uuid(item['target_card_id'])
            column = item['target_column']
            if target not in ids or target == _uuid(card['id']) or not isinstance(column, str) or not column.strip() or len(column) > 128 or (target, column) in mappings:
                raise DashboardError('DASHBOARD_INTERACTION_INVALID')
            mappings.add((target, column))
    if len(json.dumps(document, ensure_ascii=False).encode('utf-8')) > 180000:
        raise DashboardError('DASHBOARD_DOCUMENT_TOO_LARGE')
    return document



def _validate_v2(document):
    if set(document) != {'version', 'pages', 'cards', 'frames', 'blocks', 'style'} or type(document['version']) is not int:
        raise DashboardError('DASHBOARD_DOCUMENT_INVALID')
    pages, cards, frames, blocks, style = (document[k] for k in ('pages', 'cards', 'frames', 'blocks', 'style'))
    if not isinstance(pages, list) or not 1 <= len(pages) <= 12 or not all(isinstance(v, list) for v in (cards, frames, blocks)) or sum(map(len, (cards, frames, blocks))) > 40:
        raise DashboardError('DASHBOARD_DOCUMENT_INVALID')
    if not isinstance(style, dict) or set(style) != {'background', 'textColor'} or any(not isinstance(v, str) or not re.fullmatch(r'#[0-9a-fA-F]{6}', v) for v in style.values()):
        raise DashboardError('DASHBOARD_STYLE_INVALID')
    page_ids = set()
    for page in pages:
        if not isinstance(page, dict) or set(page) != {'id', 'name'} or not isinstance(page['name'], str) or not page['name'].strip() or len(page['name']) > 60:
            raise DashboardError('DASHBOARD_PAGE_INVALID')
        pid = _uuid(page['id'])
        if pid in page_ids: raise DashboardError('DASHBOARD_PAGE_INVALID')
        page_ids.add(pid)
    ids, card_ids = set(), set()
    for kind, items in (('card', cards), ('frame', frames), ('block', blocks)):
        for item in items:
            fields = {'id','page_id','x','y','w','h'}
            extra = {'chart_id','title','background','mappings','drill_path'} if kind == 'card' else {'kind','text','image','alt','color','font_size','align'} if kind == 'block' else set()
            if not isinstance(item, dict) or set(item) != fields | extra: raise DashboardError('DASHBOARD_ITEM_INVALID')
            item_id, page_id = _uuid(item['id']), _uuid(item['page_id'])
            if item_id in ids or page_id not in page_ids: raise DashboardError('DASHBOARD_ITEM_INVALID')
            ids.add(item_id)
            if any(type(item[k]) is not int for k in ('x','y','w','h')) or not (0 <= item['x'] <= 11 and 0 <= item['y'] <= 1000 and 1 <= item['w'] <= 12 and 2 <= item['h'] <= 100 and item['x'] + item['w'] <= 12): raise DashboardError('DASHBOARD_LAYOUT_INVALID')
            if kind == 'card':
                _uuid(item['chart_id']); card_ids.add(item_id)
                if not isinstance(item['title'], str) or len(item['title']) > 150 or not isinstance(item['background'], str) or not re.fullmatch(r'#[0-9a-fA-F]{6}', item['background']): raise DashboardError('DASHBOARD_CARD_INVALID')
                if not isinstance(item['mappings'], list) or len(item['mappings']) > 40 or not isinstance(item['drill_path'], list) or len(item['drill_path']) > 8 or any(not isinstance(v,str) or not v or len(v)>128 for v in item['drill_path']) or len(set(item['drill_path'])) != len(item['drill_path']): raise DashboardError('DASHBOARD_INTERACTION_INVALID')
            elif kind == 'block':
                if item['kind'] not in ('text','image','divider','spacer') or not isinstance(item['text'],str) or len(item['text'])>4000 or not isinstance(item['alt'],str) or len(item['alt'])>150 or not isinstance(item['color'],str) or not re.fullmatch(r'#[0-9a-fA-F]{6}',item['color']) or type(item['font_size']) is not int or not 10 <= item['font_size'] <= 96 or item['align'] not in ('left','center','right'): raise DashboardError('DASHBOARD_BLOCK_INVALID')
                image = item['image']
                if not isinstance(image,str) or len(image)>2_800_000 or (item['kind'] != 'image' and image): raise DashboardError('DASHBOARD_IMAGE_INVALID')
                if image:
                    match = re.fullmatch(r'data:image/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)',image)
                    if not match: raise DashboardError('DASHBOARD_IMAGE_INVALID')
                    try: raw=base64.b64decode(match.group(2),validate=True)
                    except (ValueError,binascii.Error): raise DashboardError('DASHBOARD_IMAGE_INVALID') from None
                    if len(raw)>2*1024*1024: raise DashboardError('DASHBOARD_IMAGE_INVALID')
                    valid = {'png':raw.startswith(b'\x89PNG\r\n\x1a\n'), 'jpeg':raw.startswith(b'\xff\xd8\xff'), 'gif':raw.startswith((b'GIF87a',b'GIF89a')), 'webp':len(raw)>=12 and raw[:4]==b'RIFF' and raw[8:12]==b'WEBP'}
                    if not valid[match.group(1)]: raise DashboardError('DASHBOARD_IMAGE_INVALID')
    for card in cards:
        seen = set()
        for item in card['mappings']:
            if not isinstance(item,dict) or set(item)!={'target_card_id','target_column'}: raise DashboardError('DASHBOARD_INTERACTION_INVALID')
            target, column = _uuid(item['target_card_id']), item['target_column']
            if target not in card_ids or target == _uuid(card['id']) or not isinstance(column,str) or not column.strip() or len(column)>128 or (target,column) in seen: raise DashboardError('DASHBOARD_INTERACTION_INVALID')
            seen.add((target,column))
    if len(json.dumps(document,ensure_ascii=True,separators=(',',':')).encode('utf-8')) > 6_000_000: raise DashboardError('DASHBOARD_DOCUMENT_TOO_LARGE')
    return document


def _call(actor, action, **fields):
    request = {'Purpose': 'DASHBOARD_DESIGNER_V1', 'Action': action, 'ActorUserID': _uuid(actor), **fields}
    try:
        payload = _envelope(request)
        client = CoreApiClient()
        response = client.session.post(client.url, json={'Mode': 'CoreStudioDesignerDashboard',
            'Payload': json.dumps(payload, ensure_ascii=True, separators=(',', ':'))}, timeout=client.timeout)
        response.raise_for_status()
        rows = _rows(response.json())
    except Exception:
        raise DashboardError('DASHBOARD_SERVICE_UNAVAILABLE', 503) from None
    if len(rows) != 1 or not isinstance(rows[0], dict) or rows[0].get('success') not in (True, 1):
        code = rows[0].get('code') if len(rows) == 1 and isinstance(rows[0], dict) else None
        safe = {'DASHBOARD_NOT_FOUND': 404, 'DASHBOARD_VERSION_CONFLICT': 409, 'DASHBOARD_INPUT_INVALID': 400,
                'DASHBOARD_LIMIT_REACHED': 409, 'DASHBOARD_SERVICE_UNAVAILABLE': 503}
        raise DashboardError(code, safe[code]) if code in safe else DashboardError('DASHBOARD_SERVICE_UNAVAILABLE', 503)
    return rows[0]


def list_dashboards(actor):
    row = _call(actor, 'LIST')
    try:
        items = json.loads(row.get('items_json') or '[]')
        if not isinstance(items, list): raise ValueError()
        return items
    except (ValueError, TypeError):
        raise DashboardError('DASHBOARD_SERVICE_UNAVAILABLE', 503) from None


def get_dashboard(actor, dashboard_id):
    row = _call(actor, 'GET', DashboardID=_uuid(dashboard_id))
    try:
        return {'dashboard_id': _uuid(row['dashboard_id']), 'name': row['dashboard_name'],
                'version': int(row['version']), 'document': validate_document(json.loads(row['document_json']))}
    except (KeyError, TypeError, ValueError):
        raise DashboardError('DASHBOARD_SERVICE_UNAVAILABLE', 503) from None


def save_dashboard(actor, name, document, dashboard_id=None, expected_version=0):
    if not isinstance(name, str) or not name.strip() or len(name.strip()) > 150:
        raise DashboardError('DASHBOARD_NAME_INVALID')
    if type(expected_version) is not int or not 0 <= expected_version < 2**31-1:
        raise DashboardError('DASHBOARD_VERSION_INVALID')
    validate_document(document)
    from app.routes.studio_charts_api import authorized_dataset
    for chart_id in set(card['chart_id'] for card in document['cards']):
        chart = get_chart(actor, chart_id)
        authorized_dataset(actor, chart['config']['dataset_id'], chart['config']['dataset_kind'])
    return _call(actor, 'SAVE', DashboardID=_uuid(dashboard_id) if dashboard_id else None,
                 Name=name.strip(), ExpectedVersion=expected_version,
                 Document=json.dumps(document, ensure_ascii=True, separators=(',', ':')))


def delete_dashboard(actor, dashboard_id, expected_version):
    if type(expected_version) is not int or not 1 <= expected_version < 2**31:
        raise DashboardError('DASHBOARD_VERSION_INVALID')
    return _call(actor, 'DELETE', DashboardID=_uuid(dashboard_id), ExpectedVersion=expected_version)
