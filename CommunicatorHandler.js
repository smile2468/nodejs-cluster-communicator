const Logger = new (require('./Logger'))()
const Communicator = require('./Communicator')
const cluster = require('cluster')

module.exports = (client) => Communicator.setResponse(async (msg) => {
  const defaultProps = {
    pid: process.pid,
    workerId: client.workerId,
    workerProcessId: cluster.worker.id,
    clientId: client.user.id,
    discriminator: client.user.discriminator
  }
  if (msg.msg_from_master.type === 'showIds') return defaultProps
  if (msg.msg_from_master.type === 'setWorkerCollection') {
    console.log(msg.msg_from_master.workerCollection)
    client.workerCollection = msg.msg_from_master.workerCollection
    Object.assign(defaultProps, { workerCollection: client.workerCollection })
    return defaultProps
  }
  if (msg.msg_from_master.type === 'shutdown') {
    client.logger.warn(`[Shutdown] Shutting down... (PID: ${defaultProps.pid} & workerId: ${defaultProps.workerId} & workerProcessId: ${defaultProps.workerProcessId} & clientId: ${defaultProps.clientId})`)
    process.exit()
  }
  if (msg.msg_from_master.type === 'getInfo') {
    Object.assign(defaultProps, client.getInfo())
    return defaultProps
  }
  if (msg.msg_from_master.type === 'helloWorld') {
    if (!msg.msg_from_master.tchId) throw new Error('tchId is not provided!')
    const message = await client.channels.cache.get(msg.msg_from_master.tchId).send('> Hello World!')
    return message
  }
  if (msg.msg_from_master.type === 'reload') {
    const result = await client.reload(msg.msg_from_master?.opts)
    Object.assign(defaultProps, { result })
    return defaultProps
  }
  if (msg.msg_from_master.type === 'findWorker') {
    const result = await client.find.findWorker(msg.msg_from_master?.opts ?? undefined)
    Object.assign(defaultProps, { result: true })
    client.logger.info(JSON.stringify(result))
    return defaultProps
  }
})

process.on('uncaughtException', (error) => Logger.error(error))
process.on('unhandledRejection', (reason, promise) => Logger.error(reason))
