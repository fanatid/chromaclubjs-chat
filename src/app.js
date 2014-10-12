var crypto = require('crypto')


function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest()
}

function signMessage(message, privKey) {
  var hash = sha256(new Buffer(message))
  var sign = privKey.sign(hash)
  return sign.toDER()
}

module.exports = {
  signMessage: signMessage
}
