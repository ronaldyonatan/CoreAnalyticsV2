"""Trusted source bindings produced by the server; never accepted directly from a browser."""
import ipaddress
import os
from pathlib import Path
from pyspark.sql.types import StructType,StructField,StringType
from app.batch_graph import BatchError
from app.batch_storage import contained
from app.operation_common import schema,fields,text


def read_sources(spark,definitions,root):
    frames={}
    for item in definitions:
        if not isinstance(item,dict) or item.get('id') in frames:raise BatchError('INVALID_SOURCE')
        kind=item.get('kind')
        if kind=='fixed':
            fields(item,'id kind columns rows');schema(item['columns'])
            if not isinstance(item['rows'],list) or len(item['rows'])>50 or any(not isinstance(r,list) or len(r)!=len(item['columns']) or any(v is not None and (not isinstance(v,str) or len(v)>256) for v in r) for r in item['rows']):raise BatchError('INVALID_FIXED_INPUT')
            frame=spark.createDataFrame(item['rows'],StructType([StructField(n,StringType(),True) for n in item['columns']]))
        elif kind=='parquet':
            fields(item,'id kind path')
            if not isinstance(item['path'],str):raise BatchError('INVALID_SOURCE')
            path=contained(root,Path(root)/item['path'])
            if not path.is_dir():raise BatchError('SOURCE_NOT_FOUND')
            frame=spark.read.parquet(str(path))
        elif kind=='sqlserver':
            fields(item,'id kind address hostname port database schema table username password encrypt trust_server_certificate timeout')
            # The server resolves and validates the address through its existing SQL host policy.
            try:
                ip = ipaddress.ip_address(item['address'])
            except (ValueError,TypeError):
                raise BatchError('INVALID_SQL_SOURCE') from None
            if ip.version == 6 and ip.ipv4_mapped:
                raise BatchError('INVALID_SQL_SOURCE')
            if (ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_unspecified
                    or ip.is_reserved or ip in ipaddress.ip_network('100.64.0.0/10')
                    or ip in ipaddress.ip_network('198.18.0.0/15')
                    or ip == ipaddress.ip_address('168.63.129.16')):
                raise BatchError('INVALID_SQL_SOURCE')
            if ip.is_private and os.getenv('STUDIO_SQL_ALLOW_PRIVATE','false').lower() != 'true':
                raise BatchError('INVALID_SQL_SOURCE')
            raw_networks = os.getenv('STUDIO_SQL_ALLOWED_NETWORKS','').strip()
            if raw_networks:
                try:
                    networks = [ipaddress.ip_network(x.strip(),strict=True) for x in raw_networks.split(',')]
                except ValueError:
                    raise BatchError('INVALID_SQL_SOURCE') from None
                if not any(ip in network for network in networks if network.version == ip.version):
                    raise BatchError('INVALID_SQL_SOURCE')
            raw_ports = os.getenv('STUDIO_SQL_ALLOWED_PORTS','1433').strip()
            if raw_ports != '*':
                try:
                    ports = {int(x.strip()) for x in raw_ports.split(',')}
                except ValueError:
                    raise BatchError('INVALID_SQL_SOURCE') from None
                if item['port'] not in ports:
                    raise BatchError('INVALID_SQL_SOURCE')
            if type(item['port']) is not int or not 1<=item['port']<=65535 or type(item['timeout']) is not int or not 1<=item['timeout']<=120 or type(item['encrypt']) is not bool or type(item['trust_server_certificate']) is not bool:raise BatchError('INVALID_SQL_SOURCE')
            for key in ('hostname','database','schema','table','username','password'):text(item[key],1024 if key=='password' else 255,True)
            if any(c in item['hostname'] for c in ';{}\r\n'):raise BatchError('INVALID_SQL_SOURCE')
            escape=lambda value:'{'+value.replace('}','}}')+'}'
            address='['+item['address']+']' if ':' in item['address'] else item['address']
            url='jdbc:sqlserver://'+address+':'+str(item['port'])+';databaseName='+escape(item['database'])+';encrypt='+str(item['encrypt']).lower()+';trustServerCertificate='+str(item['trust_server_certificate']).lower()+';hostNameInCertificate='+escape(item['hostname'])+';loginTimeout='+str(item['timeout'])
            quote=lambda name:'['+name.replace(']',']]')+']'
            frame=spark.read.format('jdbc').option('url',url).option('dbtable',quote(item['schema'])+'.'+quote(item['table'])).option('driver','com.microsoft.sqlserver.jdbc.SQLServerDriver').option('user',item['username']).option('password',item['password']).option('fetchsize','10000').option('queryTimeout','300').load()
        elif kind=='postgresql':
            fields(item,'id kind address hostname port database schema table username password encrypt timeout')
            try:
                ip=ipaddress.ip_address(item['address'])
            except (ValueError,TypeError):
                raise BatchError('INVALID_POSTGRESQL_SOURCE') from None
            if (ip.version==6 and ip.ipv4_mapped) or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_unspecified or ip.is_reserved or ip in ipaddress.ip_network('100.64.0.0/10') or ip in ipaddress.ip_network('198.18.0.0/15') or ip==ipaddress.ip_address('168.63.129.16'):
                raise BatchError('INVALID_POSTGRESQL_SOURCE')
            if ip.is_private and os.getenv('STUDIO_SQL_ALLOW_PRIVATE','false').lower()!='true':
                raise BatchError('INVALID_POSTGRESQL_SOURCE')
            raw_networks=os.getenv('STUDIO_SQL_ALLOWED_NETWORKS','').strip()
            if raw_networks:
                try: networks=[ipaddress.ip_network(x.strip(),strict=True) for x in raw_networks.split(',')]
                except ValueError: raise BatchError('INVALID_POSTGRESQL_SOURCE') from None
                if not any(ip in network for network in networks if network.version==ip.version):
                    raise BatchError('INVALID_POSTGRESQL_SOURCE')
            # Validate types before checking allowlisted ports. Reject booleans (bool is an int subclass).
            if (type(item['port']) is not int or not 1 <= item['port'] <= 65535
                    or type(item['timeout']) is not int or not 1 <= item['timeout'] <= 60
                    or type(item['encrypt']) is not bool):
                raise BatchError('INVALID_POSTGRESQL_SOURCE')
            raw_ports=os.getenv('STUDIO_POSTGRESQL_ALLOWED_PORTS','5432').strip()
            if raw_ports!='*':
                try:
                    tokens=[part.strip() for part in raw_ports.split(',')]
                    if not tokens or any(not token.isdecimal() for token in tokens):
                        raise ValueError('invalid allowlist')
                    ports={int(token) for token in tokens}
                    if any(not 1 <= port <= 65535 for port in ports):
                        raise ValueError('invalid allowlist')
                except ValueError:
                    raise BatchError('INVALID_POSTGRESQL_SOURCE') from None
                if item['port'] not in ports:
                    raise BatchError('INVALID_POSTGRESQL_SOURCE')
            for key in ('hostname','database','schema','table','username','password'):
                text(item[key],1024 if key=='password' else 255,True)
            if any(c in item['hostname'] for c in ';{}\r\n') or any(c in item['database'] for c in ';?&\r\n'):
                raise BatchError('INVALID_POSTGRESQL_SOURCE')
            # Connect to the policy-validated IP, not a newly resolved hostname.
            # With TLS, verify-full validates that IP against certificate SAN.
            # Deploy a trusted root certificate for the JVM when required.
            address='['+str(ip)+']' if ip.version==6 else str(ip)
            url='jdbc:postgresql://'+address+':'+str(item['port'])+'/'+item['database']
            quote=lambda name:'"'+name.replace('"','""')+'"'
            props={'url':url,'dbtable':quote(item['schema'])+'.'+quote(item['table']),
                   'driver':'org.postgresql.Driver','user':item['username'],
                   'password':item['password'],'fetchsize':'10000',
                   'queryTimeout':'300','connectTimeout':str(item['timeout']),
                   'socketTimeout':'300','readOnly':'true',
                   'sslmode':'verify-full' if item['encrypt'] else 'disable'}
            reader=spark.read.format('jdbc')
            for key,value in props.items():reader=reader.option(key,value)
            frame=reader.load()
        else:raise BatchError('UNRESOLVED_SOURCE','Dataset ID harus diotorisasi dan diikat ke sumber oleh server sebelum worker dijalankan.')
        schema(frame.columns);frames[item['id']]=frame
    return frames
