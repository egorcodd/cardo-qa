import kafkaPackage from 'kafkajs';
const { Kafka, logLevel, KafkaJSNonRetriableError } = kafkaPackage;
import pg from 'pg';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { watchConsumer } from '../packages/shared/kafka-lifecycle.ts';
import { acceptEvent } from '../services/telemetry/src/event-store.ts';
import { setTimeout as sleep } from 'node:timers/promises';

assert.match(process.env.TEST_DATABASE_URL || '', /reliability/);
assert.match(process.env.TEST_KAFKA_BROKER || '', /reliability/);
const kafka=new Kafka({clientId:'reliability-test',brokers:[process.env.TEST_KAFKA_BROKER],logLevel:logLevel.NOTHING,retry:{retries:8,initialRetryTime:500}});
const admin=kafka.admin(),producer=kafka.producer({transactionalId:'reliability-outbox',idempotent:true,maxInFlightRequests:1});
const consumer=kafka.consumer({groupId:'reliability-audit',allowAutoTopicCreation:false,sessionTimeout:6000,heartbeatInterval:1000});
const pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});
let fatal=0,health=watchConsumer(consumer,'telemetry','reliability-audit',()=>fatal++);
async function until(check){for(let i=0;i<450;i++){if(await check())return;await sleep(100);}throw new Error('reliability deadline exceeded');}
const topic='cardo.transfers.v1',id=randomUUID();
const event={eventId:id,type:'banking.transfer.completed',occurredAt:new Date().toISOString(),amount:'10.00',currency:'RUB',operationId:'tr-integration'};
try{
 await admin.connect();await admin.createTopics({topics:[{topic,numPartitions:1,replicationFactor:1}],waitForLeaders:true});
 await producer.connect();await consumer.connect();await consumer.subscribe({topics:[topic],fromBeginning:true});
 await consumer.run({autoCommitInterval:100,autoCommitThreshold:1,eachMessage:async({topic,partition,message})=>{
   if(message.value.toString()==='force-terminal-crash')throw new KafkaJSNonRetriableError('terminal fixture');
   await acceptEvent(pool,{topic,partition,offset:message.offset,value:message.value.toString()});
 }});
 await until(()=>health.ready());
 const transaction=await producer.transaction();
 await transaction.send({topic,messages:[{value:JSON.stringify(event)},{value:JSON.stringify(event)},{value:'{broken test payload'}]});
 await transaction.commit();
 await until(async()=>Number((await pool.query('SELECT count(*) FROM telemetry.events WHERE event_id=$1',[id])).rows[0].count)===1);
 await until(async()=>{
  const high=(await admin.fetchTopicOffsets(topic))[0].high;
  const offset=(await admin.fetchOffsets({groupId:'reliability-audit',topics:[topic]}))[0].partitions[0].offset;
  return offset===high;
 });
 assert.equal((await pool.query('SELECT count(*)::int n FROM telemetry.events WHERE event_id=$1',[id])).rows[0].n,1);
 const aborted=await producer.transaction();await aborted.send({topic,messages:[{value:'aborted-fixture'}]});await aborted.abort();
 await sleep(1500);
 assert.ok(health.ready(),'no business messages are required for readiness');
 await producer.send({topic,messages:[{value:'force-terminal-crash'}]});
 await until(()=>fatal===1);
 assert.equal(health.ready(),false);
 console.log(JSON.stringify({ok:true,checks:['real-transaction-control-offsets','SQL-deduplication','poison-does-not-stop-consumer','idle-heartbeats','terminal-crash-recovery-signal']}));
}finally{health.close();await consumer.stop();await consumer.disconnect();await producer.disconnect();await admin.disconnect();await pool.end();}
