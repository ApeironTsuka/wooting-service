const { serviceEmitter } = require('tserv-service'), fs = require('fs');

let kb = new serviceEmitter();

function apiReady() {
  class clockLayer extends kb.api.Layer {
    constructor(...args) {
      super(...args);
      this.alpha = 255;
      this.tmr = setInterval(() => this.tick(), 500);
    }
    stop() { clearInterval(this.tmr); }
    setAlpha(alpha = 255) { this.alpha = alpha; }
    tick() {
      let dt = new Date(), { alpha } = this;
      let printNum = (n, row) => {
        let r, g, b, o = row == 4 && kb.api.isANSI ? 2 : 1;
        b = Math.floor(n / 10); n -= b * 10;
        g = Math.floor(n / 5); n -= g * 5;
        r = n;
        for (let i = o; i < b + o; i++) { this.setLoc(row, i, 0, 0, 255, alpha); } o += b;
        for (let i = o; i < g + o; i++) { this.setLoc(row, i, 0, 255, 0, alpha); } o += g;
        for (let i = o; i < r + o; i++) { this.setLoc(row, i, 255, 0, 0, alpha); }
      };
      for (let y = 2; y < 5; y++) { for (let x = 1; x < 11; x++) { this.setLoc(y, x, 50, 50, 50, alpha); } }
      this.setLoc(4, 11, 50, 50, 50, alpha);
      printNum(dt.getHours(), 2);
      printNum(dt.getMinutes(), 3);
      printNum(dt.getSeconds(), 4);
      kb.api.updateLayer(this.uid, this, true).catch(() => this.stop());
    }
  }
  kb.api.registerLayer('clock').then((uid) => { let l = new clockLayer(kb.api, uid); });
  kb.extendApi('config');
  kb.api.config.getLayers().then(console.log);
}

kb.setIdentifier('clock');
kb.connectTo({ name: 'wooting', servicePath: `${process.cwd()}/..` });
kb.on('ready', () => { kb.loadApi(); kb.api.on('ready', apiReady); });
