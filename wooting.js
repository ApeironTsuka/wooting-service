const { Keyboard } = require('wooting-sdk'),
      { Analog } = require('wooting-sdk/analogcontroller'),
      { Toolkit, lockLayer } = require('wooting-sdk/toolkit'),
      { Layer, Renderer } = require('wooting-sdk/layered'),
      { wootingServer } = require('wooting-ipc'),
      fs = require('fs');
class bgLayer extends Layer { tick() { this.setColormapNoAlpha(this.kb.leds.profile.map); } }
class wootingService {
  constructor() { this.server = new wootingServer(); this.connections = []; }
  begin() {
    let kb = this.kb = Keyboard.get(), tk = this.tk = new Toolkit();
    if (!kb) { console.log('No keyboard detected'); process.exit(); }
    this.server.on('connection', (c) => this.attachEvents(c));
    this.server.init();
    let renderer = this.renderer = new Renderer(kb), layers = this.layers = [ this.bgLayer = { name: 'Background', layer: new bgLayer(), uid: 'bg' }, this.locksLayer = { name: 'Locks', layer: new lockLayer(tk), uid: 'locks' } ];
    kb.leds.mode = Keyboard.Modes.Array;
    kb.leds.autoUpd = true;
    kb.leds.init();
    tk.use(Toolkit.Features.AllLayered);
    tk.enable();
    tk.init(kb);
    tk.on('profileChanged', () => {
      if (kb.digitalEnabled) { this.locksLayer.layer.enable(); }
      else { this.locksLayer.layer.disable(); }
      this.sendProfileChanged();
    });
    for (let i = 0, l = layers.length; i < l; i++) { renderer.addLayer(layers[i].layer); }
    this.bgLayer.layer.z = -1;
    this.locksLayer.layer.z = 99;
    renderer.z = 0;
    renderer.sortLayers();
    renderer.init();
    this.watchWootility();
    kb.analog.watch((data) => this.sendAnalogUpdates(data));
  }
  attachEvents(c) {
    let { kb } = this;
    this.connections.push(c);
    c.layers = [];
    c.layerCounter = 0;
    c.watchAnalog = c.watchProfile = false;
    c.keyboardChanged({
      firmware: kb.getFirmwareVersion().toString(),
      model: `Wooting ${kb.deviceConfig.isTwo ? 'Two' : 'One'}`,
      isANSI: kb.deviceConfig.isANSI,
      keyCount: kb.deviceConfig.isTwo ? 118 : 96,
      rows: Analog.Rows,
      cols: kb.deviceConfig.isTwo ? Analog.ColsTwo : Analog.ColsOne,
      profile: kb.leds.profile,
      isTwo: kb.deviceConfig.isTwo
    });
    c.on('disconnected', () => {
      c.layers.forEach((l) => {
        let ind, x = this.layers.find((e, i) => { let ret = e.uid == `${c.id}-${l.uid}`; if (ret) { ind = i; } return ret; });
        this.renderer.remLayer(l.layer);
        this.layers.splice(ind, 1);
      });
      this.connections.splice(this.connections.indexOf(c), 1);
    })
    .on('ipc_registerOwnLayer', ({ name, description, z }, reply) => {
      let x = c.layers.find((e) => e.name == name), uid, l;
      if (x) { reply(-1); return; }
      uid = c.layerCounter++;
      c.layers.push(l = { name, description, layer: new Layer(), uid });
      this.layers.push({ name: `${c.id}-${name}`, description, layer: l.layer, uid: `${c.id}-${uid}` });
      this.renderer.addLayer(l.layer, z);
      x = this.layers.find((e, i) => { let ret = e.uid == this.locksLayer.uid; if (ret) { l = i; } return ret; });
      this.layers.splice(l, 1);
      this.layers.push(this.locksLayer);
      reply(uid);
    })
    .on('ipc_unregisterOwnLayer', ({ uid }, reply) => {
      let ind, x = c.layers.find((e, i) => { let ret = e.uid == uid; if (ret) { ind = i; } return ret; });
      if (!x) { reply(false); return; }
      this.renderer.remLayer(x.layer);
      c.layers.splice(ind, 1);
      this.layers.find((e, i) => { let ret = e.uid == `${c.id}-${uid}`; if (ret) { ind = i; } return ret; });
      this.layers.splice(ind, 1);
      reply(true);
    })
    .on('ipc_updateOwnLayer', ({ uid, map, alpha }, reply) => {
      let x = c.layers.find((e) => e.uid == uid);
      if (x) {
        if (alpha) { x.layer.setColormap(map); }
        else { x.layer.setColormapNoAlpha(map); }
      }
      reply();
    })
    .on('ipc_hideOwnLayer', ({ uid }, reply) => {
      let x = c.layers.find((e) => e.uid == uid);
      if (x) {
        x.layer.disable();
        reply(true);
      } else { reply(false); }
    })
    .on('ipc_showOwnLayer', ({ uid }, reply) => {
      let x = c.layers.find((e) => e.uid == uid);
      if (x) {
        x.layer.enable();
        reply(true);
      } else { reply(false); }
    })
    .on('ipc_getLayers', (d, reply) => {
      let out = [];
      for (let i = 0, { layers } = this, l = layers.length; i < l; i++) { out.push({ name: layers[i].name, description: layers[i].description, uid: layers[i].uid, z: layers[i].layer.z }); }
      reply(out.sort((a, b) => a.z > b.z ? 1 : a.z < b.z ? -1 : 0));
    })
    .on('ipc_moveLayer', ({ uid, z }, reply) => {
      // Can't move below the background
      if (z < 0) { reply(false); }
      // Can't move the bg
      else if (uid == 'bg') { reply(false); }
      else {
        let ind, x = this.layers.find((e, i) => { let ret = e.uid == uid; if (ret) { ind = i; } return ret; });
        if (x) {
          this.renderer.moveLayer(x.layer, z);
          reply(true);
        } else { reply(false); }
      }
    })
    .on('ipc_showLayer', ({ uid }, reply) => {
      let x = this.layers.find((e) => e.uid == uid);
      if (x) {
        x.layer.enable();
        reply(true);
      } else { reply(false); }
    })
    .on('ipc_hideLayer', ({ uid }, reply) => {
      let x = this.layers.find((e) => e.uid == uid);
      if (x) {
        x.layer.disable();
        reply(true);
      } else { reply(false); }
    })
    .on('ipc_watchAnalog', (d, reply) => { c.watchAnalog = true; reply(); })
    .on('ipc_unwatchAnalog', (d, reply) => { delete c.watchAnalog; reply(); })
    .on('ipc_watchProfile', (d, reply) => { c.watchProfile = true; reply(); })
    .on('ipc_unwatchProfile', (d, reply) => { delete c.watchProfile; reply(); })
    .on('ipc_takeControl', (d, reply) => {
      if (this.controller) { reply(false); return; }
      this.renderer.stop();
      this.kb.pause();
      this.controller = c;
      reply(true);
    })
    .on('ipc_releaseControl', (d, reply) => {
      if (!this.controller) { reply(true); return; }
      if (c != this.controller) { reply(false); return; }
      this.kb.resume();
      this.renderer.init();
      delete this.controller;
      reply(true);
    })
    .on('ipc_feature', ({ buf }, reply) => {
      if (!this.controller) { reply(false, true); return; }
      if (c != this.controller) { reply(false, true); return; }
      reply(this.kb.sendCommand(buf, true));
    })
    .on('ipc_buffer', ({ buf }, reply) => {
      if (!this.controller) { reply(false, true); return; }
      if (c != this.controller) { reply(false, true); return; }
      reply(this.kb.sendQuery(buf[0], buf[1], buf[2], buf[3], buf[4], true));
    });
  }
  sendAnalogUpdates(data) {
    let { connections } = this;
    for (let i = 0, l = connections.length; i < l; i++) {
      if (!connections[i].watchAnalog) { continue; }
      connections[i].analog(data);
    }
  }
  sendProfileChanged() {
    let { connections } = this, { profile } = this.kb.leds;
    for (let i = 0, l = connections.length; i < l; i++) {
      if (!connections[i].watchProfile) { continue; }
      connections[i].profileChanged(profile.id, profile.map);
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
