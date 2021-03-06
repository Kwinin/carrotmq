/**
 * Created by bangbang93 on 16-3-2.
 */
'use strict';
const carrotmq       = require('../src/index').CarrotMQ;
const rabbitmqSchema = require('rabbitmq-schema');
const Assert         = require('assert');
const ValidateError  = carrotmq.ValidationError;
require('should');

const schema = new rabbitmqSchema({
  exchange: 'exchange0',
  type    : 'topic',
  bindings: [{
    routingPattern: 'foo.bar.#',
    destination   : {
      queue        : 'fooExchangeQueue',
      messageSchema: {}
    }
  }, {
    routingPattern: 'rpc.#',
    destination   : {
      queue        : 'rpcQueue',
      messageSchema: {}
    }
  }, {
    routingPattern: 'schema',
    destination: {
      queue: 'schemaQueue',
      messageSchema: {
        name: 'schema-test',
        type: 'object',
        properties: {
          time: {
            type: 'string',
          },
          arr: {
            type: 'array',
          },
        },
        required: ['time', 'arr'],
      }
    }
  }]
});

const {RABBITMQ_USER, RABBITMQ_PASSWORD, RABBITMQ_HOST, RABBITMQ_VHOST = ''} = process.env;

const uri = `amqp://${RABBITMQ_USER}:${RABBITMQ_PASSWORD}@${RABBITMQ_HOST}/${RABBITMQ_VHOST}`;

const app = new carrotmq(uri, schema);

app.on('error', function (err) {
  console.error(err);
  process.exit(-1);
});

before('setup with schema', async function (){
  await app.connect()
});

after(function () {
  return app.close();
});

describe('carrotmq', function () {
  this.timeout(5000);
  it('publish and subscribe', async function () {
    await new Promise(async (resolve) => {
      await app.queue('fooExchangeQueue', function () {
        this.ack();
        resolve()
      })
      await app.publish('exchange0', 'foo.bar.key', {time: new Date})
    })
    app.channels.size.should.eql(2)
  });
  it('should reject wrong schema', function (done) {
    let app;
    try {
      app = new carrotmq(uri, {});
      app.connect()
      console.log(app);
    } catch (e) {
      if (e instanceof TypeError){
        done();
      } else {
        done(e);
      }
    }
    app.on('error', function (err) {
      if (err instanceof TypeError){
        done();
      } else {
        done(err);
      }
    })
  });
  it('rpc', function (done) {
    app.queue('rpcQueue', async function (data) {
      console.log(data);
      await this.ack();
      await this.reply(data);
      await this.cancel();
    });
    let time = new Date();
    app.rpc('rpcQueue', {time})
      .then(function (reply) {
        reply.ack();
        const data = reply.data;
        if (new Date(data.time).valueOf() === time.valueOf()){
          done();
        } else {
          done(new Error('wrong time'));
        }
      })
  });
  it('rpc error', async function () {
    await app.queue('rpcQueue', function () {
      this.reply({err: 'error message'});
      this.ack();
    });
    let time = new Date();
    const reply = await app.rpc('rpcQueue', {time})
    console.log(reply.data)
    reply.data.err.should.eql('error message')
    reply.ack()
  });
  it('schema validate failed in sendToQueue', function () {
      return app.sendToQueue('schemaQueue', {time: new Date().toJSON()})
        .then(() => {
          throw new Error('no error throw')
        })
        .catch((e) => {
          e.should.instanceof(ValidateError);
        })
  });
  it('schema validate success', function (done) {
    const now = new Date();
    app.queue('schemaQueue', function (data) {
      console.log(now, data);
      Assert(new Date(data.time).valueOf() === now.valueOf());
      Assert(Array.isArray(data.arr));
      this.ack();
      this.cancel().then(() => done());
    });
    app.sendToQueue('schemaQueue', {
      time: now.toJSON(),
      arr: [1, 2, 3],
    });
  });
  it('schema validate failed in consumer', function (done) {
    app.queue('schemaQueue', function (data) {
      console.log(data);
      this.ack();
      this.cancel();
      done(new Error('should validation failed'));
    });
    app.once('validationError:schemaQueue', (err) => {
      err.should.instanceof(ValidateError);
      err.channel.ack(err.content);
      done();
    });
    app.sendToQueue('schemaQueue', {time: new Date().toJSON()}, {skipValidate: true});
  });
});

process.on('unhandledRejection', function (err) {
  console.log(err);
});
