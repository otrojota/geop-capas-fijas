const {ProveedorCapas, Origen, CapaRaster} = require("geop-base-proveedor-capas");
const config = require("./Config").getConfig();
const gdal = require("./GDAL");
const fsProm = require("fs").promises;
const dbg = require("./Debug");

class ProveedorCapasFijas extends ProveedorCapas {
    constructor(opciones) {
        super("fixed", opciones);
        this.addOrigen("gebco", "GEBCO", "https://www.gebco.net/", "./img/gebco-logo.svg"); 
        // batimetria
        this.addCapa(
            new CapaRaster("gebco", "BATIMETRIA_2019", "Batimetría - 2019", "gebco", {
                formatos:{
                    isolineas:true, isobandas:true, serieTiempo:false, valorEnPunto:true, uv:false, windglPNG:false, matrizRectangular:true
                },
                decimales:2,
                temporal:false                
            }, ["topografia"], "img/batimetria.svg", "m", [], 0)
        )
        setInterval(_ => this.eliminaArchivosPublicados(), 60000);
        this.eliminaArchivosPublicados();
    }

    async eliminaArchivosPublicados() {
        try {
            let dir = await fsProm.readdir(config.publishPath);
            let ahora = new Date().getTime();
            let limite = ahora - 60 * 1000;
            for (let i=0; i<dir.length; i++) {
                let path = config.publishPath + "/" + dir[i];
                let stats = await fsProm.stat(path);
                let t = stats.mtimeMs;
                if (t < limite) {
                    try {
                        await fsProm.unlink(path);
                    } catch(err) {
                        console.error("Eliminando archivo", err);
                    }
                }
            }
        } catch(error) {
            console.error(error);
        }
    }

    getPath(dt) {
        return config.dataPath + "/" + dt.format("YYYY") + "/" + dt.format("MM");
    }
    async getPreconsulta(codigoCapa, lng0, lat0, lng1, lat1, tiempo, nivel, maxWidth, maxHeight) {
        let op = dbg.start(`Preconsulta ${codigoCapa}`);
        try {
            switch(codigoCapa) {
                case "BATIMETRIA_2019":
                    return await this.getPreconsultaBatimetria2019(lng0, lat0, lng1, lat1, maxWidth, maxHeight);
                default:
                    throw "Capa '' desconocida";
            }
        } catch(error) {
            console.error(error);
            throw error;
        } finally {
            dbg.end(op);
        }
    }

    async getLimitesBatimetria2019() {
        if (this._limitesBatimetria2019) return this._limitesBatimetria2019;
        try {
            let info = await gdal.info(config.dataPath + "/GEBCO_2019-cut.nc");
            this._limitesBatimetria2019 = {
                lat0:info.cornerCoordinates.lowerLeft[1],
                lat1:info.cornerCoordinates.upperLeft[1],
                lng0:info.cornerCoordinates.lowerLeft[0],
                lng1:info.cornerCoordinates.lowerRight[0],
                width:info.size[0],
                height:info.size[1],
                info:info
            }
            return this._limitesBatimetria2019;            
        } catch(error) {
            console.error(error);
            throw error;
        }
    }

    async getPreconsultaBatimetria2019(lng0, lat0, lng1, lat1, maxWidth, maxHeight) {
        try {
            let outFileName = "tmp_" + parseInt(Math.random() * 9999999999) + ".tif";
            let outPath = config.publishPath + "/" + outFileName;
            let srcPath = config.dataPath + "/GEBCO_2019-cut.nc";
            let varMetadata = await this.getLimitesBatimetria2019();
            let box = gdal.boxToPixels(lng0, lat0, lng1, lat1, varMetadata);

            maxWidth = maxWidth || 200;
            maxHeight = maxHeight || 200;
            let outSizeX = box.x1 - box.x0 + 1;
            let outSizeY = box.y0 - box.y1 + 1;
            if (outSizeX > maxWidth) outSizeX = maxWidth;
            if (outSizeY > maxHeight) outSizeY = maxHeight;            

            await gdal.translateSrcWindow(box, srcPath, outPath, [], outSizeX, outSizeY);

            let advertencias = [];
            if (outSizeX == maxWidth|| outSizeY == maxHeight) advertencias.push("Se han interpolado los resultados para ajustarse a una resolución de " + maxWidth + "[lng] x " + maxHeight + "[lat]. Para obtener los datos originales, consulte por un área más pequeña.");
            let info = await gdal.info(outPath, true);
            let atributos = {};
            if (info.metadata && info.metadata[""]) {
                Object.keys(info.metadata[""]).forEach(name => {
                    let p = name.indexOf("#");
                    if (p > 0) {
                        let origen = name.substr(0,p);
                        let atName = name.substr(p+1);
                        if (origen == "elevation" || origen == "NC_GLOBAL") {
                            atributos[atName] = info.metadata[""][name];
                        }
                    }
                });
            }
            let ret = {                
                atributos:atributos,
                advertencias:advertencias,
                min:info.bands[0].computedMin,
                max:info.bands[0].computedMax,
                tmpFileName:outFileName,
                resX:info.size[0],
                resY:info.size[1]
            }            
            return ret;
            
            /*
            maxWidth = maxWidth || 200;
            maxHeight = maxHeight || 200;

            let width = null, height = null;
            let dx = 0.004136029412, dy = 0.00416171969;
            if ((lng1 - lng0) / dx > maxWidth) {
                width = maxWidth; height = maxHeight;
            } 
            if ((lat1 - lat0) / dy > maxHeight) {
                height = maxHeight; width = width || maxWidth;
            }            
            await gdal.translateWindow(lng0, lat0, lng1, lat1, srcPath, outPath, [], {width:width, height:height});
            let advertencias = [];
            if (width && height) advertencias.push("Se han interpolado los resultados para ajustarse a una resolución de " + width + "[lng] x " + height + "[lat]. Para obtener los datos originales, consulte por un área más pequeña.");
            let info = await gdal.info(outPath, true);
            let atributos = {};
            if (info.metadata && info.metadata[""]) {
                Object.keys(info.metadata[""]).forEach(name => {
                    let p = name.indexOf("#");
                    if (p > 0) {
                        let origen = name.substr(0,p);
                        let atName = name.substr(p+1);
                        if (origen == "elevation" || origen == "NC_GLOBAL") {
                            atributos[atName] = info.metadata[""][name];
                        }
                    }
                });
            }
            let ret = {                
                atributos:atributos,
                advertencias:advertencias,
                min:info.bands[0].computedMin,
                max:info.bands[0].computedMax,
                tmpFileName:outFileName,
                resX:info.size[0],
                resY:info.size[1]
            }            
            return ret;
            */

        } catch(error) {
            console.error(error);
            throw error;
        }
    }

    async resuelveConsulta(formato, args) {
        let op = dbg.start(`Consulta ${formato}`);
        try {
            if (formato == "isolineas") {
                return await this.generaIsolineas(args);
            } else if (formato == "isobandas") {
                return await this.generaIsobandas(args);
            } else if (formato == "serieTiempo") {
                //return await this.generaSerieTiempo(args);
            } else if (formato == "valorEnPunto") {
                return await this.generaValorEnPunto(args);
            } else if (formato == "matrizRectangular") {
                return await this.generaMatrizRectangular(args);
            } else throw "Formato " + formato + " no soportado";
        } catch(error) {
            throw error;
        } finally {
            dbg.end(op);
        }
    }

    generaIsolineas(args) {
        try {
            let srcFile = config.publishPath + "/" + args.tmpFileName;
            //let dstFile = srcFile + ".isocurvas.geojson";
            let dstFile = srcFile + ".isocurvas.shp";
            let increment = args.incremento;
            return new Promise((resolve, reject) => {
                gdal.isolineas(srcFile, dstFile, increment)
                    .then(_ => {
                        resolve({fileName:args.tmpFileName + ".isocurvas.shp"});
                    })
                    .catch(err => reject(err));
            });
        } catch(error) {
            throw error;
        }
    }
    generaMarcadores(isolineas) {
        try {
            let ret = [];
            isolineas.features.forEach(f => {
                if (f.geometry.type == "LineString") {
                    let v = Math.round(f.properties.value * 100) / 100;
                    let n = f.geometry.coordinates.length;
                    let med = parseInt((n - 0.1) / 2);
                    let p0 = f.geometry.coordinates[med], p1 = f.geometry.coordinates[med+1];
                    let lng = (p0[0] + p1[0]) / 2;
                    let lat = (p0[1] + p1[1]) / 2;
                    ret.push({lat:lat, lng:lng, value:v});
                }
            });
            return ret;
        } catch(error) {
            console.error(error);
            return [];
        }
    }

    generaIsobandas(args) {
        try {
            let srcFile = config.publishPath + "/" + args.tmpFileName;
            let dstFile = srcFile + ".isobandas.shp";
            let increment = args.incremento;
            return new Promise((resolve, reject) => {
                gdal.isobandas(srcFile, dstFile, increment)
                    .then(_ => {
                        resolve({fileName:args.tmpFileName + ".isobandas.shp"});
                    })
                    .catch(err => reject(err));
            });
        } catch(error) {
            throw error;
        }
    }
    
    async generaValorEnPunto(args) {
        try {
            if (args.codigoVariable == "BATIMETRIA_2019") {
                return await this.generaValorEnPuntoBatimetria2019(args);
            } else throw "Capa '" + args.codigoVariable + "' no soporta Valor en Punto";
        } catch(error) {
            console.error(error);
            throw error;
        }
    }    

    async generaValorEnPuntoBatimetria2019(args) {
        try {
            let lat = args.lat;
            let lng = args.lng;
            let path = config.dataPath + "/GEBCO_2019-cut.nc";
            let varMetadata = await this.getLimitesBatimetria2019();
            //let punto = await gdal.getPointValue(lng, lat, path, null, config.publishPath);
            let punto = await gdal.getPixelValue(lng, lat, path, null, varMetadata);
            //let info = await gdal.info(path, false);
            let info = varMetadata.info;
            let atributos = {};
            atributos.realLat = punto.realLat;
            atributos.realLng = punto.realLng;
            if (info.metadata && info.metadata[""]) {
                Object.keys(info.metadata[""]).forEach(name => {
                    let p = name.indexOf("#");
                    if (p > 0) {
                        let origen = name.substr(0,p);
                        let atName = name.substr(p+1);
                        if (origen == "elevation" || origen == "NC_GLOBAL") {
                            atributos[atName] = info.metadata[""][name];
                        }
                    }
                });
            }
            return {lng:lng, lat:lat, time:args.time, atributos:atributos, value:punto.value}            
        } catch(error) {
            console.error(error);
            throw error;
        }
    }

    async generaMatrizRectangular(args) {
        try {
            if (args.codigoVariable == "BATIMETRIA_2019") {
                return await this.generaMatrizRectangularBatimetria2019(args);
            } else throw "Capa '" + args.codigoVariable + "' no soporta Matriz Rectangular";
        } catch(error) {
            console.error(error);
            throw error;
        }
    }   

    async generaMatrizRectangularBatimetria2019(args) {
        try {
            let maxWidth = args.maxWidth || 150;
            let maxHeight = args.maxHeight || 150;

            let lng0 = args.lng0, lat0 = args.lat0, lng1 = args.lng1, lat1 = args.lat1;
            let varMetadata = await this.getLimitesBatimetria2019();
            let data = await gdal.getRectangularMatrix(lng0, lat0, lng1, lat1, config.dataPath + "/GEBCO_2019-cut.nc", null, maxWidth, maxHeight, config.publishPath, varMetadata);            
            data.unit = "m";
            let info = varMetadata.info;
            let atributos = {};
            if (info.metadata && info.metadata[""]) {
                Object.keys(info.metadata[""]).forEach(name => {
                    let p = name.indexOf("#");
                    if (p > 0) {
                        let origen = name.substr(0,p);
                        let atName = name.substr(p+1);
                        if (origen == "elevation" || origen == "NC_GLOBAL") {
                            atributos[atName] = info.metadata[""][name];
                        }
                    }
                });
            }
            data.atributos = atributos;
            data.dx = (data.lng1 - data.lng0) / data.ncols;
            data.dy = (data.lat1 - data.lat0) / data.nrows;
            if (data.interpola) data.advertencias = ["Se han interpolado los resultados para ajustarse a una resolución de " + maxWidth + "[lng] x " + maxHeight + "[lat]. Para obtener los datos originales, consulte por un área más pequeña."];
            return data;
            /*
            let dx = 0.004136029412, dy = 0.00416171969;
            lng0 = dx * parseInt(lng0 / dx) - dx;
            lat0 = dy * parseInt(lat0 / dy) - dy;
            lng1 = dx * parseInt(lng1 / dx) + dx*2;
            lat1 = dy * parseInt(lat1 / dy) + dy*2;

            if ((lng1 - lng0) / dx > maxWidth) {
                width = maxWidth; height = maxHeight;
            } 
            if ((lat1 - lat0) / dy > maxHeight) {
                height = maxHeight; width = width || maxWidth;
            }            
            let data = await gdal.getRectangularMatrix(lng0, lat0, lng1, lat1, config.dataPath + "/GEBCO_2019-cut.nc", null, width, height, config.publishPath);            
            data.unit = "m";
            let info = await gdal.info(config.dataPath + "/GEBCO_2019-cut.nc", false);
            let atributos = {};
            if (info.metadata && info.metadata[""]) {
                Object.keys(info.metadata[""]).forEach(name => {
                    let p = name.indexOf("#");
                    if (p > 0) {
                        let origen = name.substr(0,p);
                        let atName = name.substr(p+1);
                        if (origen == "elevation" || origen == "NC_GLOBAL") {
                            atributos[atName] = info.metadata[""][name];
                        }
                    }
                });
            }
            data.atributos = atributos;
            data.lng0 = data.xllcorner; data.lng1 = data.lng0 + data.dx * data.ncols;
            data.lat0 = data.yllcorner; data.lat1 = data.lat0 + data.dy * data.nrows;
            if (width && height) data.advertencias = ["Se han interpolado los resultados para ajustarse a una resolución de " + width + "[lng] x " + height + "[lat]. Para obtener los datos originales, consulte por un área más pequeña."];
            return data;
            */
        } catch(error) {
            console.error(error);
            throw error;
        }
    }
}

module.exports = ProveedorCapasFijas;