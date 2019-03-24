const { Keyboard } = require('wooting-sdk'),
      { Toolkit, lockLayer } = require('wooting-sdk/toolkit'),
      { Layer, Renderer } = require('wooting-sdk/layered'),
      { serviceEmitter } = require('tserv-service'),
      fs = require('fs');
class bgLayer extends Layer { tick() { this.setColormapNoAlpha(this.kb.leds.profile.map); } }
class wootingService {
  constructor() { this.emitter = new serviceEmitter(); this.connections = []; }
  begin() {
    this.emitter.on('connection', (c) => this.attachEvents(c));
    this.emitter.init('wooting', { keep: true });
    let kb = this.kb = Keyboard.get(), tk = this.tk = new Toolkit();
    if (!kb) { console.log('No keyboard detected'); process.exit(); }
    let renderer = this.renderer = new Renderer(kb), layers = this.layers = [ { name: 'Background', layer: new bgLayer(), uid: 'bg' }, { name: 'Locks', layer: new lockLayer(tk), uid: 'locks' } ];
    kb.leds.mode = Keyboard.Modes.Array;
    kb.leds.autoUpd = true;
    kb.leds.init();
    tk.use(Toolkit.Features.AllLayered);
    tk.enable();
    tk.init(kb);
    tk.on('profileChanged', () => this.sendProfileChanged());
    for (let i = 0, l = layers.length; i < l; i++) { renderer.addLayer(layers[i].layer); }
    renderer.init();
    this.watchWootility();
    fs.writeFileSync(`${process.cwd()}/services/ports/wooting.port`, this.emitter.port);
    setInterval(() => this.sendAnalogUpdates(), 20);
  }
  attachEvents(c) {
    let { kb } = this;
    c.loadApi();
    c.layers = [];
    c.layerCounter = 0;
    c.api.watchAnalog = c.api.watchProfile = false;
    this.connections.push(c);
    c.on('disconnected', () => {
      c.layers.forEach((l) => {
        let ind, x = this.layers.find((e, i) => { let ret = e.uid == l.uid; if (ret) { ind = i; } return ret; });
        this.renderer.remLayer(l.layer);
        this.layers.splice(ind, 1);
      });
      this.connections.splice(this.connections.indexOf(c), 1);
    })
    .on('getKeyboardInfo', (d, reply) => reply({
      firmware: kb.getFirmwareVersion().toString(),
      isTwo: kb.deviceConfig.isTwo,
      isANSI: kb.deviceConfig.isANSI,
      profile: kb.leds.profile
    }))
    .on('registerLayer', ({ name }, reply) => {
      let x = c.layers.find((e) => e.name == name), uid, l;
      if (x) { reply(-1); return; }
      uid = c.layerCounter++;
      c.layers.push(l = { name, layer: new Layer(), uid });
      this.layers.push({ name: `${c.id}-${name}`, layer: l.layer, uid: `${c.id}-${uid}` });
      this.renderer.addLayer(l.layer);
      reply(uid);
    })
    .on('unregisterLayer', ({ uid }, reply) => {
      let ind, x = c.layers.find((e, i) => { let ret = e.uid == uid; if (ret) { ind = i; } return ret; });
      if (!x) { reply(false); return; }
      this.renderer.remLayer(x.layer);
      c.layers.splice(ind, 1);
      this.layers.find((e, i) => { let ret = e.uid == `${c.id}-${uid}`; if (ret) { ind = i; } return ret; });
      this.layers.splice(ind, 1);
      reply(true);
    })
    .on('updateLayer', ({ uid, map, alpha }, reply) => {
      let x = c.layers.find((e) => e.uid == uid);
      if (x) {
        if (alpha) { x.layer.setColormap(map); }
        else { x.layer.setColormapNoAlpha(map); }
      }
      reply();
    })
    .on('hideLayer', ({ uid }, reply) => {
      let x = c.layers.find((e) => e.uid == uid);
      if (x) {
        x.layer.disable();
        reply(true);
      } else { reply(false); }
    })
    .on('showLayer', ({ uid }, reply) => {
      let x = c.layers.find((e) => e.uid == uid);
      if (x) {
        x.layer.enable();
        reply(true);
      } else { reply(false); }
    })
    .on('config-getLayers', (d, reply) => {
      let out = [];
      for (let i = 0, { layers } = this, l = layers.length; i < l; i++) { out.push({ name: layers[i].name, uid: layers[i].uid }); }
      reply(out);
    })
    .on('config-moveLayer', ({ uid, index }, reply) => {
      // Can't move below the background or above the lock layer
      if ((index <= 1) || (index >= this.layers.length-1)) { reply(false); }
      // Can't move the bg or lock layers
      else if ((uid == 'bg') || (uid == 'locks')) { reply(false); }
      else {
        let ind, x = this.layers.find((e, i) => { let ret = e.uid == uid; if (ret) { ind = i; } return ret; });
        if (x) {
          this.layers.splice(i, 1);
          this.layers.splice(index, 0, x);
          this.renderer.moveLayer(x.layer, index);
          reply(true);
        } else { reply(false); }
      }
    })
    .on('config-showLayer', ({ uid }, reply) => {
      let x = this.layers.find((e) => e.uid == uid);
      if (x) {
        x.layer.enable();
        reply(true);
      } else { reply(false); }
    })
    .on('config-hideLayer', ({ uid }, reply) => {
      let x = this.layers.find((e) => e.uid == uid);
      if (x) {
        x.layer.disable();
        reply(true);
      } else { reply(false); }
    })
    .on('watchAnalog', (d, reply) => { c.api.watchAnalog = true; reply(); })
    .on('unwatchAnalog', (d, reply) => { delete c.api.watchAnalog; reply(); })
    .on('watchProfile', (d, reply) => { c.api.watchProfile = true; reply(); })
    .on('unwatchProfile', (d, reply) => { delete c.api.watchProfile; reply(); })
    .on('raw-takeControl', (d, reply) => {
      if (this.controller) { reply(false); return; }
      this.renderer.stop();
      this.kb.pause();
      this.controller = c;
      reply(true);
    })
    .on('raw-releaseControl', (d, reply) => {
      if (!this.controller) { reply(true); return; }
      if (c != this.controller) { reply(false); return; }
      this.kb.resume();
      this.renderer.init();
      delete this.controller;
      reply(true);
    })
    .on('raw-feature', ({ buf }, reply) => {
      if (!this.controller) { reply(false, true); return; }
      if (c != this.controller) { reply(false, true); return; }
      reply(this.kb.sendCommand(buf, true));
    })
    .on('raw-buffer', ({ buf }, reply) => {
      if (!this.controller) { reply(false, true); return; }
      if (c != this.controller) { reply(false, true); return; }
      reply(this.kb.sendQuery(buf[0], buf[1], buf[2], buf[3], buf[4], true));
    });
  }
  sendAnalogUpdates() {
    let { connections } = this;
    for (let i = 0, l = connections.length; i < l; i++) {
      if (!connections[i].api.watchAnalog) { continue; }
      connections[i].api.analog(this.kb.analog.readFull());
    }
  }
  sendProfileChanged() {
    let { connections } = this, { profile } = this.kb.leds;
    for (let i = 0, l = connections.length; i < l; i++) {
      if (!connections[i].api.watchProfile) { continue; }
      connections[i].api.profileChanged(profile.id, profile.map);
    }
  }
  watchWootility() {
    let configPath = (process.env.APPDATA || (process.platform == 'darwin' ? `${process.env.HOME}/Library/Application Support` : (process.env.XDG_CONFIG_HOME || `${process.env.HOME}/.config`))),
        watcher = fs.watch(`${configPath}/wootility`), wootilityRunning = false;
    watcher.on('change', (event, filename) => {
      if (filename == 'SingletonLock') {
        if (wootilityRunning) {
          console.log('WOOTILITY NO LONGER RUNNING');
          wootilityRunning = false;
          this.kb.resume();
          this.renderer.init();
        } else {
          console.log('WOOTILITY RUNNING');
          wootilityRunning = true;
          this.renderer.stop();
          this.kb.pause();
        }
      }
    });
  }
}

let server = wootingService.inst = new wootingService();
server.begin();
process.on('SIGINT', () => process.exit());
