import CarrotMQ from './index'
import {Channel, Options} from 'amqplib'

export interface IConfig {
  rpcTimeout?: number
}

export interface IRPCResult{
  data: any,
  ack()
}

export interface IContent {
  message: any,
  fields: object,
  properties: object,
  replyTo: string,
  content: Buffer | object,
  carrotmq: CarrotMQ,
  channel: Channel,
  _isAcked: boolean,
  reply(msg: any, options?: Options.Publish),
  ack(allUpTo?: boolean),
  nack(allUpTo?: boolean, requeue?: boolean),
  reject(requeue?: boolean),
  cancel()
}
