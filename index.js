var optimist = require('optimist')
  .usage('Usage: $0 [options]')
  .options('testnet', {
    describe: 'use testnet network',
    default: false
  })
  .options('p', {
    alias: 'port',
    describe: 'server port',
    default: 28832
  })
  .options('h', {
    alias: 'help',
    describe: 'show this help',
    default: false
  })

var argv = optimist.argv
if (argv.help) {
  optimist.showHelp()
  process.exit(0)
}

var bitcoin = require('bitcoinjs-lib')
var crypto = require('crypto')
function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest()
}


var ccWallet = require('cc-wallet-core')
var walletOpts = { testnet: argv.testnet }
var wallet = new ccWallet(walletOpts)

function checkCoin(colorDesc, txId, outIndex, pubKey, cb) {
  var bs = wallet.getBlockchain()
  var getTxFn = bs.getTx.bind(bs)

  // check is colored
  var colorDefinition = wallet.getColorDefinitionManager().resolveByDesc(colorDesc)
  wallet.getColorData().getColorValue(txId, outIndex, colorDefinition, getTxFn, function(error, colorValue) {
    if (error)
      return cb(error)

    if (colorValue === null)
      return cb(new Error('Coin ' + txId + ':' + outIndex + ' is not colored'))

    // check pubKey
    bs.getTx(txId, function(error, tx) {
      if (error)
        return cb(error)

      var script = bitcoin.Script.fromBuffer(tx.outs[outIndex].script.toBuffer())
      var network = bitcoin.networks[argv.testnet ? 'testnet' : 'bitcoin']
      var address = bitcoin.Address.fromOutputScript(script, network).toBase58Check()
      if (bitcoin.ECPubKey.fromHex(pubKey).getAddress(network).toBase58Check() !== address)
        return cb(new Error('PubKey is not valid'))

      // check is confirmed and unspent
      bs.getUTXO(address, function(error, utxo) {
        if (error)
          return cb(error)

        utxo = utxo.filter(function(coin) {
          return (coin.txId === txId && coin.outIndex === outIndex)
        })

        if (utxo.length === 0)
          return cb(new Error('Coin not found'))

        if (utxo[0].confirmations === 0)
          return cb(new Error('Coin is not confirmed'))

        cb(null)
      })
    })
  })
}


var express = require('express')
var app = express()
app.use(express.static(__dirname + '/public'))
app.use('/bower_components',  express.static(__dirname + '/bower_components'))
app.get('/getServerSettings', function(req, res) {
  res.json({ testnet: argv.testnet })
})

var server = require('http').createServer(app)
server.listen(argv.port, function() {
  console.log('Server listening at port %d', argv.port)
})

var io = require('socket.io')(server)
io.on('connection', function(socket) {
  socket.coins = {}

  socket.on('join', function(desc, txId, outIndex, pubKey) {
    checkCoin(desc, txId, outIndex, pubKey, function(error) {
      if (error)
        return socket.emit('join', desc, error.message)

      socket.join(desc, function() {
        socket.coins[desc] = {txId: txId, outIndex: outIndex, pubKey: pubKey}
        socket.emit('join', desc, null)
      })
    })
  })

  socket.on('message', function(room, data) {
    data.txId = socket.coins[room].txId
    data.outIndex = socket.coins[room].outIndex
    data.pubKey = socket.coins[room].pubKey

    var hash = sha256(new Buffer(data.message))
    var sign = bitcoin.ECSignature.fromDER(new Buffer(data.sign, 'hex'))
    var pubKey = bitcoin.ECPubKey.fromHex(data.pubKey)
    if (!pubKey.verify(hash, sign))
      return

    // Todo: check client coins is not spended
    io.sockets.in(room).emit('message', room, data)
  })
})
