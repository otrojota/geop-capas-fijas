let debug = false;
for (let i=2; i<process.argv.length; i++) {
    let arg = process.argv[i].toLowerCase();
    if (arg == "-dbg" || arg == "-debug") debug = true;
}
if (debug) {
    process.env.DEBUG = true;
}

global.confPath = __dirname + "/config.json";
const ProveedorCapasFijas = require("./lib/ProveedorCapasFijas");
const config = require("./lib/Config").getConfig();
const proveedorCapas = new ProveedorCapasFijas({
    puertoHTTP:config.webServer.http.port,
    directorioWeb:__dirname + "/www",
    directorioPublicacion:config.publishPath
});
proveedorCapas.start();