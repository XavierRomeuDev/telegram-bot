const TelegramBot = require('node-telegram-bot-api');
const Firebird = require('node-firebird');
const Fuse = require('fuse.js');
const dbConfig = require('./dbConfig');

const token = dbConfig.token;
const bot = new TelegramBot(token, {
    polling: {
        interval: 300,
        autoStart: true,
        params: {
            allowed_updates: ['message', 'edited_message', 'channel_post', 'edited_channel_post']
        }
    }
});

let clientList = [];
let fuseClientes;
let fuseArticles;
let articleList = [];

Firebird.attach(dbConfig.firebird, async (err, firebirdClient) => {
    if (err) {
        console.error('❌ Error conectando a Firebird:', err);
        return;
    }
    console.log('✅ Conectado a Firebird correctamente');

    getAllClients(firebirdClient);
    getAllArticles(firebirdClient);

    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const messageText = msg.text || '' ;

        if (messageText.toLowerCase() === 'resum') {
            const resumen = await getResumenPedidos(firebirdClient);
            bot.sendMessage(chatId, resumen);
        } else {
            const analyzedData = analyzeMessage(messageText);
            console.log('📩 Mensaje analizado:', analyzedData);

            const bestMatch = searchBestClientMatch(analyzedData.cliente);

            if (bestMatch) {
                console.log(`✅ Cliente encontrado: ${bestMatch.codigo} - ${bestMatch.nombre_comercial}`);

                const articleCodes = findArticleCodes(analyzedData.articulos);
                console.log('🛒 Artículos encontrados:', articleCodes);

                if (articleCodes.length > 0) {
                    await insertMessageToDatabase(firebirdClient, bestMatch.codigo, articleCodes, analyzedData.diaPedido);
                    bot.sendMessage(chatId, `✅ Pedido de ${analyzedData.cliente} procesado correctamente.`);
                } else {
                    bot.sendMessage(chatId, `⚠️ No se encontraron artículos válidos.`);
                }
            } else {
                console.log(`⚠️ Cliente no encontrado: "${analyzedData.cliente}"`);
                bot.sendMessage(chatId, `⚠️ No se encontró un cliente similar a "${analyzedData.cliente}".`);
            }
        }
    });

    async function getResumenPedidos(client) {
        const query = `
            SELECT
              pvl.cod_articulo AS CODIGO_ARTICULO,
              MAX(pvl.descripcion) AS PRODUCTO,
              SUM(pvl.cantidad_pedida) AS CANTIDAD_TOTAL,
              a.cod_subfamilia AS TIPO_ARTICLE
            FROM
              tbl_pedidos_venta_lin pvl
            JOIN
              tbl_articulos a ON pvl.cod_articulo = a.codigo
            JOIN
              tbl_pedidos_venta_cab pvc ON pvl.id_pedido = pvc.id
            JOIN
              (
                SELECT
                  cod_cliente,
                  cod_ruta
                FROM
                  tbl_rutas_clientes
                WHERE
                  cod_ruta IN (0,1,2,3,4,600,700,800,900,901)
              ) rc ON pvc.cod_cliente = rc.cod_cliente
            WHERE
              pvc.servido != 1
              AND pvc.cod_empresa = 100
              AND (a.cod_subfamilia LIKE 'N' OR a.cod_subfamilia LIKE 'B' OR a.cod_subfamilia LIKE 'C' OR a.cod_subfamilia LIKE 'F')
            GROUP BY
              pvl.cod_articulo, a.cod_subfamilia
            ORDER BY
              PRODUCTO;
        `;

        try {
            const result = await runQuery(client, query);
            if (result.length === 0) {
                return "⚠️ No se encontraron datos en el resumen.";
            }

            let resumen = "Resumen de Pedidos:\n";
            result.forEach(row => {
                resumen += `\nProducto: ${row.PRODUCTO}\nCantidad Total: ${row.CANTIDAD_TOTAL}\n`;
            });
            return resumen;
        } catch (error) {
            console.error('❌ Error en la consulta de resumen:', error);
            return '❌ Error al obtener el resumen de pedidos.';
        }
    }

    function getAllClients(client) {
        const query = "SELECT codigo, nombre_comercial FROM tbl_clientes WHERE COD_EMPRESA = 100 AND NOMBRE_COMERCIAL NOT LIKE 'Z %'";
    
        client.query(query, (err, result) => {
            if (err) {
                console.error("❌ Error al obtener clientes:", err);
            } else {    
                clientList = result.map(row => ({
                    codigo: row.CODIGO,
                    nombre_comercial: row.NOMBRE_COMERCIAL
                }));
    
                fuseClientes = new Fuse(clientList, {
                    keys: ['nombre_comercial'],
                    threshold: 0.2,
                    ignoreLocation: true,
                    minMatchCharLength: 2,
                    caseSensitive: false,
                });                

                console.log(`✅ ${clientList.length} clientes cargados en Fuse.js`);
            }
        });
    }

    function searchBestClientMatch(nombreCliente) {
        if (!fuseClientes || !nombreCliente) return null;

        const cleanName = nombreCliente.toLowerCase().trim();
        const resultado = fuseClientes.search(cleanName);
        
        console.log(`🔍 Buscando "${cleanName}" en Fuse.js... Resultado:`, resultado);
    
        return resultado.length > 0 ? resultado[0].item : null;
    }

    function getAllArticles(client) {
        const query = "SELECT codigo, nombre_idioma_1 FROM tbl_articulos where cod_empresa = 100";
        
        client.query(query, (err, result) => {
            if (err) {
                console.error("❌ Error al obtener artículos:", err);
            } else {
                articleList = result.map(row => ({
                    codigo: row.CODIGO,
                    nombre_idioma_1: row.NOMBRE_IDIOMA_1
                }));
                
                fuseArticles = new Fuse(articleList, {
                    keys: ['nombre_idioma_1'],
                    threshold: 0.3,
                    caseSensitive: false,
                    ignoreLocation: true,
                    minMatchCharLength: 2
                });

                console.log(`✅ ${articleList.length} artículos cargados en Fuse.js`);
            }
        });
    }

    function findArticleCodes(articulos) {
        const articleDetails = [];
    
        articulos.forEach(articulo => {
            const bestMatch = searchBestArticleMatch(articulo.descripcion);
            if (bestMatch) {
                articleDetails.push({
                    cantidad: articulo.cantidad,
                    codigo: bestMatch.codigo,
                    descripcion: bestMatch.nombre_idioma_1 + "       " + articulo.anotacion,
                });
                console.log(`✅ Artículo encontrado: ${articulo.descripcion} -> Código: ${bestMatch.codigo}`);
            } else {
                console.log(`⚠️ Artículo no encontrado: "${articulo.descripcion}"`);
            }
        });
    
        return articleDetails;
    }
    
    function searchBestArticleMatch(nombreArticulo) {
        if (!fuseArticles || !nombreArticulo) return null;
    
        const cleanArticulo = nombreArticulo.toLowerCase().trim();
        const resultado = fuseArticles.search(cleanArticulo);
        
        console.log(`🔍 Buscando "${cleanArticulo}" en Fuse.js... Resultado:`, resultado);
        
        return resultado.length > 0 ? resultado[0].item : null;
    }

    function analyzeMessage(msg) {
        if (typeof msg !== 'string' || msg.trim() === '') {
            return { error: "Formato de mensaje inválido." };
        }
    
        const lines = msg.split('\n').map(line => line.trim());
        if (lines.length < 2) {
            return { error: "Formato de mensaje incorrecto." };
        }
    
        const cliente = lines[0].toLowerCase().trim();  
        let diaInput = lines[1].trim();  
       
        let diaPedido = obtenerFechaPedido(diaInput);
        let i = (!isNaN(diaInput) && diaInput.length <= 2) ? 2 : 1;
    
        const articulos = [];
        while (i < lines.length) {
            const line = lines[i];
    
            const match = line.match(/^(\d+)(\s*[a-zA-Z]{1,3})?,\s*(.+)$/);
            if (match) {
                const cantidad = parseInt(match[1], 10);
                const unidad = match[2] ? match[2].trim() : '';
                let descripcion = match[3].trim();
    
                const anotacion = descripcion.includes('.') ? descripcion.split('.').slice(1).join('.').trim() : null;
    
                descripcion = descripcion.split('.')[0].trim();
    
                articulos.push({
                    cantidad: cantidad,
                    unidad: unidad,
                    descripcion: descripcion,
                    anotacion: anotacion || ''
                });
            } else {
                console.log(`Línea no coincide con el patrón: ${line}`);
                break;
            }
            i++;
        }
    
        console.log(articulos); 
    
        return { cliente, diaPedido, articulos };
    }   
    
    function obtenerFechaPedido(diaInput) {
        const today = new Date();
        let diaActual = today.getDate();
        let mes = today.getMonth() + 1; 
        let año = today.getFullYear();
    
        let dia;
    
        const isDiaValido = !isNaN(diaInput) && diaInput.length <= 2 && parseInt(diaInput, 10) >= 1 && parseInt(diaInput, 10) <= 31;
    
        if (isDiaValido) {
            dia = parseInt(diaInput, 10);
            if (dia < diaActual) {
                mes += 1;
                if (mes > 12) {
                    mes = 1;
                    año += 1;
                }
            }
        } else {
            today.setDate(today.getDate() + 1);
            dia = today.getDate();
            mes = today.getMonth() + 1;
            año = today.getFullYear();
        }
    
        let ultimoDiaMes = new Date(año, mes, 0).getDate();
        if (dia > ultimoDiaMes) {
            dia = ultimoDiaMes;
        }
    
        return `${año}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    }

    async function insertMessageToDatabase(client, codigoCliente, articleCodes, diaPedido) {
        try {
            const lastIdPedido = await getLastId(client, "SELECT MAX(ID) AS last_id FROM tbl_pedidos_venta_cab WHERE COD_EMPRESA = 100");
            let idPedido = lastIdPedido + 1;
            let numLinea = 1;  
    
            const lastIdLinea = await getLastId(client, "SELECT MAX(ID) AS last_id_linea FROM tbl_pedidos_venta_lin WHERE COD_EMPRESA = 100");
            let idLinea = lastIdLinea + 1; 
    
            await runQuery(client, `
                INSERT INTO TBL_PEDIDOS_VENTA_CAB (ID, COD_EMPRESA, COD_SERIE, NUM_PEDIDO, ANYO, FECHA_PEDIDO, FECHA_ENTREGA, SERVIDO, BLOQUEADO, COD_CLIENTE, MATRICULA, KILOMETRAJE, HORAS_FUNCIONAMIENTO, NUM_PEDIDO_CLIENTE, NUM_BULTOS, PRONTO_PAGO, DTO, PORTES, IVA_PORTES, RE_PORTES, IVA_LINEAL, GASTOS_FINANCIEROS, APLICAR_GASTOS_FIN, IRPF, REGIMEN_IRPF, APLICAR_RE, COD_TARIFA, COD_ALMACEN, COD_CANAL, COD_FORMA_PAGO, COD_REPRESENTANTE, COD_TRANSPORTISTA, COD_RUTA, COD_DIVISA, DG_COD_BANCO, DG_OFICINA, DG_DC, DG_NUM_CUENTA, DG_IBAN, DG_BIC, DE_DIRECCION, DE_COD_POBLACION, DF_DIRECCION, DF_COD_POBLACION, CC_NOMBRE, CC_NIF, CC_DIRECCION, CC_COD_POBLACION, APLICAR_FIANZA, FIANZA, IMPORTE_FIANZA, COD_EJERCICIO, COD_CUENTA_FIANZA, IMPRIMIR_COD_ARTICULO, IMPRIMIR_TOTAL_SECCION, IMPRIMIR_PRECIOS, IMPRIMIR_VALORACION, FECHA_CREACION, HORA_CREACION, USUARIO_CREACION, FECHA_MODIFICACION, HORA_MODIFICACION, USUARIO_MODIFICACION, COD_CENTRO_COSTE, DNI_FIRMANTE, COD_OBRA)
                VALUES ((SELECT MAX(ID) + 1 FROM TBL_PEDIDOS_VENTA_CAB), 100, 'VE', (SELECT MAX(NUM_PEDIDO) + 1 FROM TBL_PEDIDOS_VENTA_CAB), ?, ?, '2025-01-09', 0, 0, ?, NULL, NULL, NULL, NULL, 0, 0, 0, 0, 0, 0, NULL, 0, 'T', 0, 'N', 0, 1, 'AG', NULL, 'G30', 2, NULL, '0', 'EURO', '2100', '9155', '59', '0200053195', 'ES9721009155590200053195', 'CAIXESBBXXX', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, 0, 0, NULL, NULL, 1, 1, 1, 1, ?, '22:55:00', 'JOSEP', NULL, NULL, NULL, NULL, NULL, NULL);
            `, [new Date().getFullYear(), diaPedido, codigoCliente, diaPedido]);
    
            console.log('✅ Cabecera guardada con ID:', idPedido);
    
            for (const articulo of articleCodes) {
                await runQuery(client, `
                    INSERT INTO TBL_PEDIDOS_VENTA_LIN (ID, ID_PEDIDO, NUM_LINEA, COD_EMPRESA, COD_ARTICULO, DESCRIPCION, COD_SECCION, COD_SUB_SECCION, COD_AGRUPACION, COD_MARCA, IVA_INCLUIDO, IVA, RE, DTO, PRECIO_COMPRA, PRECIO_VENTA, PRECIO_VENTA_SIN_IVA, PRECIO_VENTA_CON_IVA, CANTIDAD_PEDIDA, CANTIDAD_SERVIDA, COMISION, NOTAS, ESTILO_CURSIVA, ESTILO_NEGRITA, ESTILO_SUBRAYADO, FECHA_CREACION, HORA_CREACION, USUARIO_CREACION, FECHA_MODIFICACION, HORA_MODIFICACION, USUARIO_MODIFICACION, I1, I2, I3, I4, N1, N2, N3, N4, A1, A5, A10, A30, L1, L2, D1)
                    VALUES ((SELECT MAX(ID) + 1 FROM TBL_PEDIDOS_VENTA_LIN), (SELECT MAX(ID) FROM TBL_PEDIDOS_VENTA_CAB), ?, 100, ?, ?, 'MT', NULL, NULL, 'MU', 0, 10, 1.4, 0, 1.65, 2.9, 2.9, 3.19, ?, 0, 0, NULL, 0, 0, 0, '2025-01-08', '21:42:00', 'JOSEP', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
                `, [numLinea, articulo.codigo, articulo.descripcion, articulo.cantidad]);
    
                console.log('✅ Línea de pedido guardada con ID:', idLinea);
                idLinea++;
                numLinea++;
            }
    
        } catch (error) {
            console.error('❌ Error en la inserción de datos:', error);
        }
    }
    
    function getLastId(client, query) {
        return new Promise((resolve, reject) => {
            client.query(query, (err, result) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(result[0] ? result[0].last_id || 0 : 0);
                }
            });
        });
    }
    
    function runQuery(client, query, params = []) {
        return new Promise((resolve, reject) => {
            client.query(query, params, (err, result) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(result);
                }
            });
        });
    }    

    process.on('SIGINT', () => {
        console.log('🛑 Cerrando conexión con Firebird...');
        firebirdClient.detach();
        process.exit();
    });
});
