import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

for(const exists of [true,false])test(`Elasticsearch setup preserves the active rollover alias (exists=${exists})`,()=>{
 const code=`let created=0;globalThis.fetch=async(url)=>{
   if(url.endsWith('/_alias/cardo-logs'))return new Response(JSON.stringify(${exists ? "{'cardo-logs-000019':{aliases:{'cardo-logs':{is_write_index:true}}}}" : "{error:{type:'alias_missing_exception'}}"}),{status:${exists ? 200 : 404}});
   if(url.endsWith('/cardo-logs-000001')){created++;return new Response('{}',{status:${exists ? 500 : 201}});}
   return new Response('{}',{status:200});
 };process.argv[2]='elastic';await import(${JSON.stringify(new URL('../services/telemetry/setup.ts',import.meta.url).href)});if(created!==${exists ? 0 : 1})throw new Error('unexpected seed index creation');`;
 const vars=Object.fromEntries(['ELASTIC_ADMIN_PASSWORD','ELASTIC_WRITER_PASSWORD','ELASTIC_READER_PASSWORD','KIBANA_SYSTEM_PASSWORD','TOOLS_STUDENT_PASSWORD'].map(key=>[key,'isolated-test-value']));
 const result=spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8',env:{...process.env,...vars,ELASTIC_URL:'http://isolated-elasticsearch.test'}});
 assert.equal(result.status,0,result.stderr);
});
