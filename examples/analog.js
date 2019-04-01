const { wootingClient, Layer } = require('wooting-ipc'), fs = require('fs');

let kb = new wootingClient();

function ready() {
  let lastx = 0, l;
  kb.registerOwnLayer('key').then((uid) => { l = new Layer(kb, uid); });
  kb.watchAnalog();
  kb.on('analogUpdate', () => {
    let x = kb.readKey(kb.Analog.Spacebar);
    if (x != lastx) { lastx = x; l.setKey(kb.LEDs.Spacebar, 0, 0, 0, x); kb.updateOwnLayer(l, true); }
  });
}

kb.connect();
kb.on('ready', ready);
