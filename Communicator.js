const cluster = require('cluster')
class WorkerCommunicator {
  constructor (workerCount) {
    this.workerCount = workerCount
    this.createdTime = Date.now()
    this.dataList = []
  }

  setResponse (data) { this.dataList.push(data) }
  getResponseAll () { return this.dataList }
  readyToReport () { return this.dataList.length >= this.workerCount }
  isTimeout () { return Date.now() - this.createdTime > 10000 }
}

module.exports = {
  workerCommunicatorList: {},
  isInited: false,
  COMMAND_NAME: 'worker_communicator_command',
  MSG: { REQ: 'req_communicator_data', RES: 'res_communicator_data' },
  req: async function (opts = {}) {
    this._init()
    const workerCount = opts.worker_count || Object.keys(cluster.workers).length
    const msgFromMaster = opts.msg || null
    const self = this
    return new Promise(resolve => {
      const communicatorId = self._getCommunicatorId()
      self.workerCommunicatorList[communicatorId] = new WorkerCommunicator(workerCount)
      process.once(self._getCommunicatorEventId(communicatorId), (res) => resolve(res))
      if (msgFromMaster?.targetWorkerId) {
        const reqMsg = {}
        Object.assign(reqMsg, {
          [self.COMMAND_NAME]: self.MSG.REQ,
          id: communicatorId,
          msg_from_master: msgFromMaster
        })
        return cluster.workers[msgFromMaster?.targetWorkerId].send(reqMsg)
      }
      for (const id in cluster.workers) {
        const reqMsg = {}
        Object.assign(reqMsg, {
          [self.COMMAND_NAME]: self.MSG.REQ,
          id: communicatorId,
          msg_from_master: msgFromMaster
        })
        cluster.workers[id].send(reqMsg)
      }
    })
  },
  setResponse: function (fnResponse) {
    if (typeof fnResponse !== 'function') return
    const self = this
    const listener = async (msg) => {
      if (!(self.COMMAND_NAME in msg) || msg[self.COMMAND_NAME] !== self.MSG.REQ) return
      const resMsg = await fnResponse(msg)
      Object.assign(resMsg, {
        [self.COMMAND_NAME]: self.MSG.RES,
        id: msg.id
      })
      process.send(resMsg)
    }
    const onMessageListeners = process.listeners('message')
    let listenerExists = false
    for (let i = 0; i < onMessageListeners.length; i++) {
      if (listener === onMessageListeners[i]) {
        listenerExists = true
        break
      }
    }
    if (!listenerExists) process.addListener('message', listener)
  },
  _init: function () {
    if (this.isInited === true) return
    this.isInited = true
    const self = this
    const listener = (worker, message, handler) => {
      if (!(self.COMMAND_NAME in message) || message[self.COMMAND_NAME] !== self.MSG.RES) return
      self._res(message)
    }
    const onMessageListeners = cluster.listeners('message')
    let listenerExists = false
    for (let i = 0; i < onMessageListeners.length; i++) {
      if (listener === onMessageListeners[i]) {
        listenerExists = true
        break
      }
    }
    if (listenerExists === false) cluster.addListener('message', listener)
    setInterval(() => {
      for (const communicatorId in self.workerCommunicatorList) {
        if (self.workerCommunicatorList[communicatorId].isTimeout()) {
          process.emit(
            self._getCommunicatorEventId(communicatorId),
            [{ message: 'timed out.' }]
          )
          delete self.workerCommunicatorList[communicatorId]
        }
      }
    }, 1000)
  },
  _res: function (msg) {
    const communicatorId = msg.id
    if (!(communicatorId in this.workerCommunicatorList)) return
    delete msg[this.COMMAND_NAME]
    delete msg.id
    this.workerCommunicatorList[communicatorId].setResponse(msg)
    if (this.workerCommunicatorList[communicatorId].readyToReport()) {
      process.emit(this._getCommunicatorEventId(communicatorId), this.workerCommunicatorList[communicatorId].getResponseAll())
      delete this.workerCommunicatorList[communicatorId]
    }
  },
  _getCommunicatorId: function () {
    const x = parseInt(Math.random().toString().substr(2), 10).toString(36).substr(0, 10).padStart(10, 'x')
    const y = Date.now().toString(36).substr(0, 10).padStart(10, 'y')
    return x + y
  },
  _getCommunicatorEventId: function (communicatorId) { return `communicator_event_${communicatorId}` }
}
