"""Public AI configuration validation before reading dataset metadata or credentials."""
import math
import re


def validate_ai_steps(steps):
    ai = [s for s in steps if isinstance(s,dict) and s.get('type') == 'ai_llm']
    if len(ai) > 4: raise ValueError('AI_TOO_MANY_STEPS')
    for s in ai:
        if set(s) != {'type','task','model','source','instructions','execution','mode','output','labels','topics','prompt','temperature','fields'}: raise ValueError('AI_INVALID_CONFIG')
        if not isinstance(s['model'],str) or '://' in s['model'] or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._/:@-]{0,127}',s['model']): raise ValueError('AI_INVALID_MODEL')
        for key,limit in (('source',128),('output',128),('prompt',2000),('instructions',2000)):
            if not isinstance(s[key],str) or len(s[key]) > limit: raise ValueError('AI_INVALID_CONFIG')
        if s['execution'] not in ('BATCH','NON_BATCH') or type(s['temperature']) not in (float,int) or not math.isfinite(s['temperature']) or not 0 <= s['temperature'] <= 2: raise ValueError('AI_INVALID_CONFIG')
        for key,limit in (('labels',10),('topics',5),('fields',5)):
            if not isinstance(s[key],list) or len(s[key]) > limit: raise ValueError('AI_INVALID_CONFIG')
            names=[]
            for entry in s[key]:
                if not isinstance(entry,dict) or set(entry) != ({'name','kind','description'} if key=='fields' else {'name','description'}) or not isinstance(entry['name'],str) or not entry['name'].strip() or len(entry['name'])>128 or not isinstance(entry['description'],str) or len(entry['description'])>256: raise ValueError('AI_INVALID_CONFIG')
                if key=='fields' and entry['kind'] not in ('Text','Integer','Floating Decimal','Boolean'): raise ValueError('AI_INVALID_CONFIG')
                names.append(entry['name'].lower())
            if len(set(names))!=len(names): raise ValueError('AI_COLUMN_CONFLICT')
        task,mode=s['task'],s['mode']
        if task=='classify':
            if mode not in ('single','multi') or len(s['labels'])<2 or not s['source'].strip() or s['topics'] or s['fields']: raise ValueError('AI_INVALID_CONFIG')
        elif task=='sentiment':
            if mode not in ('overall','targeted') or not s['source'].strip() or s['labels'] or s['fields'] or (mode=='targeted' and not s['topics']) or (mode=='overall' and s['topics']): raise ValueError('AI_INVALID_CONFIG')
        elif task=='generate':
            if mode not in ('text','structured') or not s['prompt'].strip() or s['labels'] or s['topics'] or (mode=='structured' and not s['fields']) or (mode=='text' and s['fields']): raise ValueError('AI_INVALID_CONFIG')
        else: raise ValueError('AI_INVALID_CONFIG')
        if mode in ('single','overall','text') and not s['output'].strip(): raise ValueError('AI_INVALID_CONFIG')
