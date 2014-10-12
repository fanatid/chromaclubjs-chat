$(function() {
  var socket = io()
  var serverSettings
  var wallet
  var walletSeed
  var chats = {}
  var currentChat

  function showError(error) {
    $('<div class="alert alert-danger" role="alert">' + error.message + '</div>')
      .appendTo('body')
      .alert()
      .fadeTo(10000, 500).slideUp(500, function() {
        $(this).alert('close')
      })
  }

  $('#nav-send-form form').submit(function(e) {
    e.preventDefault()

    var message = $('#nav-send-form input').val()
    if (!message)
      return

    if (currentChat === undefined)
      return

    var data = {
      message: message,
      sign: App.signMessage(message, chats[currentChat].privKey).toString('hex')
    }

    socket.emit('message', chats[currentChat].roomName, data)

    $('#nav-send-form input').val('')
  })

  socket.on('connect', function() {
    $.get('/getServerSettings', function(data) {
      serverSettings = data

      $('#chromaclub-network').text('Network: ' + (serverSettings.testnet ? 'testnet' : 'mainnet'))
      wallet = new ccWallet({ testnet: serverSettings.testnet })

      getSeed()
    })
  })

  function getSeed() {
    var currentModal = $('#passwordmodal')
    var clonedModal = currentModal.clone()

    currentModal.modal({
      backdrop: 'static',
      keyboard: false
    }).on('hide.bs.modal', function() {
      walletSeed = $('#passwordmodal input').val()
      currentModal.remove()

      try {
        if (wallet.isInitialized()) {
          if (!wallet.isCurrentSeed(walletSeed))
            throw new Error('On initialization was used other seed...')

        } else {
          wallet.initialize(walletSeed)

        }

        /**/
        var gold = {
          monikers: ['gold'],
          colorDescs: ['epobc:b95323a763fa507110a89ab857af8e949810cf1e67e91104cd64222a04ccd0bb:0:180679'],
          unit: 10
        }
        wallet.addAssetDefinition(walletSeed, gold)
        /**/
        fullSync()

      } catch(error) {
        showError(error)
        $('body').append(clonedModal)
        setTimeout(getSeed, 0)

      }
    })
  }

  function fullSync() {
    $('#waitmodal').modal({ backdrop: 'static', keyboard: false })

    wallet.fullScanAllAddresses(function(error) {
      $('#waitmodal').modal('hide')

      if (error) {
        showError(error)
        return
      }

      updateChats()
      setTimeout(updateCoins, 5000)
    })
  }

  function updateCoins() {
    wallet.scanAllAddresses(function(error) {
      if (error) {
        showError(error)
        return
      }

      updateChats()
      setTimeout(updateCoins, 5000)
    })
  }

  function updateChats() {
    var removedMonikers = Object.keys(chats).reduce(function(o, v) { o[v] = true; return o }, {})

    wallet.getAllAssetDefinitions().forEach(function(assetdef) {
      var moniker = assetdef.getMonikers()[0]

      delete removedMonikers[moniker]

      if ($('#chat-selector-' + moniker).length === 1)
        return

      chats[moniker] = { status: 'wait' }

      $('<li><a href="#" id="chat-selector-' + moniker + '">' + moniker + '</a></li>')
        .appendTo($('#chat-selector'))
        .find('a')
        .click(function(e) {
          e.preventDefault()
          openChat(moniker)
        })

      $('#chat-template')
        .clone()
        .attr('id', 'chat-for-' + moniker)
        .appendTo($('#chats'))
    })

    Object.keys(removedMonikers).forEach(function(moniker) {
      delete chats[moniker]
      $('#chat-selector-' + moniker + ' a').unbind()
      $('#chat-selector-' + moniker).remove()
      $('#chat-for-' + moniker).remove()
      // Todo: check active chat and hide send form
    })

    // Todo: check current coin available
  }

  function openChat(moniker) {
    $('#chats > div').hide()
    $('#nav-send-form').hide()

    if (moniker === 'bitcoin') {
      showError(new Error('for bitcoin chat not available...'))
      return
    }

    if (chats[moniker].status === 'connected') {
      $('#chat-for-' + moniker).show()
      $('#nav-send-form').show()
      return
    }

    $('#waitmodal').modal('show')

    var assetdef = wallet.getAssetDefinitionByMoniker(moniker)
    getCoinList(assetdef, function(coinList) {
      var coin = coinList.getCoins()[0]
      if (coin === undefined) {
        $('#waitmodal').modal('hide')
        showError(new Error('You don\'t have coins'))
        return
      }

      var roomName = assetdef.getColorSet().getColorDescs()[0]
      var privKey = wallet.getAddressManager().getPrivKeyByAddress(walletSeed, coin.address)
      joinChat(moniker, roomName, coin.txId, coin.outIndex, privKey, function(error) {
        $('#waitmodal').modal('hide')

        if (error)
          return showError(error)

        $('#nav-send-form').show()
        $('#chat-for-' + moniker).show()
      })
    })
  }

  function getCoinList(assetdef, cb) {
    var coinQuery = wallet.getCoinQuery()
    coinQuery = coinQuery.onlyColoredAs(assetdef.getColorSet().getColorDefinitions())
    coinQuery = coinQuery.onlyAddresses(wallet.getAllAddresses(assetdef))

    coinQuery.getCoins(function(error, coinList) {
      if (error)
        showError(error)
      else
        cb(coinList)
    })
  }

  function joinChat(moniker, roomName, txId, outIndex, privKey, cb) {
    function onJoin(desc, errorMsg) {
      if (desc !== roomName)
        return

      socket.removeListener('join', onJoin)

      if (errorMsg)
        return cb(new Error(errorMsg))

      currentChat = moniker

      chats[moniker].status = 'connected'
      chats[moniker].roomName = roomName
      chats[moniker].privKey = privKey

      function onLeave(desc) {
        if (desc !== roomName)
          return

        $('#chat-selector-' + moniker).hide()
        if (currentChat === moniker)
          $('#nav-send-form').hide()

        socket.removeListener('leave', onLeave)
        socket.removeListener('message', onMessage)
      }

      function onMessage(desc, data) {
        if (desc !== roomName)
          return

        var html = '\
<li class="list-group-item list-group-item-warning"> \
  <h5 class="list-group-item-heading">' + txId + ':' + outIndex + ' says:</h5> \
  <p class="list-group-item-text">' + data.message + '</p> \
</li>'
        $(html).appendTo('#chat-for-' + moniker + ' div.list-group')
      }

      socket.on('leave', onLeave)
      socket.on('message', onMessage)

      return cb(null)
    }

    socket.on('join', onJoin)
    socket.emit('join', roomName, txId, outIndex, privKey.pub.toHex())
  }
})
