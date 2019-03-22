const { serviceEmitter } = require('tserv-service'), fs = require('fs');

let client = new serviceEmitter();

function apiReady() {
  class clockLayer extends client.api.Layer {
    constructor(uid, isTwo) {
      super(isTwo, uid);
      this.alpha = 255;
      this.tmr = setInterval(() => this.tick(), 500);
    }
    stop() { clearInterval(this.tmr); }
    setAlpha(alpha = 255) { this.alpha = alpha; }
    tick() {
      let dt = new Date(), { alpha } = this;
      let printNum = (n, row) => {
        let r, g, b, o = row == 4 && client.api.isANSI ? 2 : 1;
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
      client.api.updateLayer(this.uid, this, true).catch(() => this.stop());
    }
  }
  client.api.registerLayer('clock').then((uid) => { let l = new clockLayer(uid, client.api.isTwo); });
}

client.setIdentifier('clock');
client.connectTo({ name: 'wooting', servicePath: `${process.cwd()}/..` });
client.on('ready', function () { client.loadApi(); client.api.on('ready', apiReady); });
