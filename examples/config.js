const { server: WebSocketServer, router: WebSocketRouter } = require('websocket'),
      { wootingClient, Layer } = require('wooting-ipc'),
      http = require('http'),
      urlp = require('url'),
      fs = require('fs');

let server = http.createServer(),
    wsServer = new WebSocketServer({ httpServer: server }),
    router = new WebSocketRouter(),
    kb = new wootingClient(), layers, con;

function reparsePath(p) {
  if (! /(\.\/|\/\/)/.test(p)) { return p; }
  let a = p.split(/\//), a2 = [], out = '';
  for (let i = 0, l = a.length; i < l; i++) {
    if ((a[i] == '.') || (a[i] == '')) { continue; }
    else if (a[i] == '..') { a2.pop(); }
    else { a2.push(a[i]); }
  }
  if (a2.length == 0) { return '/'; }
  a = a2.join('/');
  if (! /^\//.test(a)) { a = '/'+a; }
  return a;
}
function findIndex(p) {
  let a = ['/index.html', '/index.htm' ], tp;
  for (var i = 0, l = a.length; i < l; i++) {
    tp = reparsePath(p+a[i]);
    if (fs.existsSync(tp)) { return tp; }
  }
  return undefined;
}
function sortLayers() { layers = layers.sort((a, b) => a.z > b.z ? 1 : a.z < b.z ? -1 : 0); }

server.on('request', (req, res) => {
  let url = urlp.parse(req.url, true), path = reparsePath(url.pathname), fname = `${__dirname}/webroot${path}`;
  if (fs.existsSync(fname)) {
    fs.stat(fname, (err, stat) => {
      if (err) { res.writeHead(404); res.end('404'); return; }
      if (stat.isDirectory()) { fname = findIndex(fname); if (!fname) { res.writeHead(404); res.end('404'); return; } }
      let stream = fs.createReadStream(fname);
      stream.on('error', (err) => { res.end(); }); // FIXME not a good way to do this, but it shouldn't ever really happen
      stream.pipe(res);
    });
  }
  else { res.writeHead(404); res.end('404'); }
});
server.listen(8080);
router.attachServer(wsServer);
console.log('Listening on http://localhost:8080/');

router.mount('*', 'config', (req) => {
  con = req.accept(req.origin);
  con._send = con.send;
  con.send = function (d) { if (!con.connected) { return; } con._send(JSON.stringify(d)); };
  con.on('message', (msg) => {
    if (msg.type !== 'utf8') { return; }
    let o = JSON.parse(msg.utf8Data);
    switch (o.ev) {
      case 'get': con.send({ ev: 'list', layers }); break;
      case 'move':
        kb.moveLayer(o.uid, o.z)
        .then((ret) => {
          if (ret) {
            let { uid, z } = o;
            con.send({ ev: 'move', uid, z });
            let x = layers.find((e) => { return e.uid == uid; });
            x.z = z;
            sortLayers();
          }
        });
        break;
      case 'enable':
        kb[o.enabled?'enableLayer':'disableLayer'](o.uid)
        .then((ret) => {
          if (ret) {
            let { uid, enabled } = o;
            con.send({ ev: 'enable', uid, enabled: enabled });
            let x = layers.find((e) => { return e.uid == uid; });
            x.enabled = enabled;
          }
        });
        break;
      default: break;
    }
  });
  con.on('close', () => { delete con; con = undefined; });
  con.on('error', () => { delete con; con = undefined; });
});

kb.connect();
kb.on('ready', () => {
  kb.watchLayers()
  .then(() => kb.getLayers())
  .then((l) => { layers = l; });
});

kb.on('layerAdd', (uid, name, description, z) => {
  layers.push({ uid, name, description, z });
  sortLayers();
  if (con) { con.send({ ev: 'add', layer: { uid, name, description, z, enabled: true } }); }
});
kb.on('layerRem', (uid) => {
  let ind, x = layers.find((e, i) => { let ret = e.uid == uid; if (ret) { ind = i; } return ret; });
  layers.splice(ind, 1);
  if (con) { con.send({ ev: 'rem', uid }); }
});
kb.on('layerMoved', (uid, z) => {
  let x = layers.find((e) => { return e.uid == uid; });
  x.z = z;
  sortLayers();
  if (con) { con.send({ ev: 'move', uid, z }); }
});
kb.on('layerEnabled', (uid, enabled) => {
  let x = layers.find((e) => { return e.uid == uid; });
  x.enabled = enabled;
  if (con) { con.send({ ev: 'enable', uid, enabled }); }
});
