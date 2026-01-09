/**
 * ============================================================================
 * 🚀 META ADS TO SHEETS - FREE CONNECTOR (ETL)
 * ============================================================================
 * * DESCRIPCIÓN:
 * Este script extrae métricas de Meta Ads (Facebook/Instagram) y las guarda
 * en esta Google Sheet automáticamente.
 * * 👨‍💻 AUTOR: Felipe Valenzuela (Growth Engineer)
 * * ⚙️ INSTRUCCIONES DE CONFIGURACIÓN:
 * 1. Ve a "Configuración del Proyecto" (Icono Engranaje ⚙️ a la izquierda).
 * 2. Baja a "Propiedades de la secuencia de comandos".
 * 3. Añade estas dos propiedades (claves):
 * - META_ACCESS_TOKEN: Tu token de larga duración (Empieza con EA...)
 * - META_ACCOUNT_ID: Tu ID de cuenta publicitaria (ej: act_12345678)
 * 4. Ejecuta la función 'obtenerInsightsDesdeEnero'.
 * * ============================================================================
 */

// === CONFIGURACIÓN GLOBAL ===
const CONFIG = {
  API_VERSION: "v19.0", 
  TZ: "America/Santiago", // Zona Horaria
  MAX_EXECUTION_MS: 340000, // ~5.6 min (Límite seguro de Apps Script)
  RETRY_LIMIT: 5,
  SHEET_NAME: "MetaKpis", // Nombre de la pestaña donde caerán los datos
  EMAILS: {
    ERROR: "tucorreo@ejemplo.com", // Cambia esto por tu email para alertas
    SUCCESS: "tucorreo@ejemplo.com"
  },
  // 'ad' = alcance por anuncio (suma total no es real).
  // 'campaign' | 'adset' = evita duplicidad sumando solo una vez por día/grupo
  REACH_LEVEL: 'ad'
};

const HEADERS = [
  "Nombre de la campaña", "Nombre del conjunto de anuncios", "Nombre del anuncio",
  "Día", "Resultados", "Alcance", "Impresiones", "Frecuencia",
  "Costo por resultado (CLP)", "Importe gastado (CLP)", "CTR (todos)",
  "Conversaciones WhatsApp"
];

// === PROPIEDADES DEL SCRIPT (Seguridad) ===
const PROPS = PropertiesService.getScriptProperties();
const ACCESS_TOKEN = PROPS.getProperty("META_ACCESS_TOKEN");
const ACCOUNT_ID = PROPS.getProperty("META_ACCOUNT_ID");

/**
 * FUNCIÓN PRINCIPAL
 * Carga datos desde el 01-01-2025 hasta Ayer.
 */
function obtenerInsightsDesdeEnero() {
  const startTime = Date.now();
  
  // 1. Validaciones de Seguridad
  if (!ACCESS_TOKEN || !ACCOUNT_ID) {
    const errorMsg = "⛔ ERROR: Token o Account ID no configurados en 'Propiedades de la secuencia de comandos'. Revisa las instrucciones al inicio del código.";
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  // 2. Configuración de Hoja (Dinámica para Plantillas)
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("⛔ Error: No se pudo detectar la Hoja de Cálculo activa.");
  
  ss.setSpreadsheetTimeZone(CONFIG.TZ);
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(CONFIG.SHEET_NAME);
  
  sheet.clearContents();
  sheet.appendRow(HEADERS);

  // 3. Definición de Fechas
  const since = "2025-01-01"; // Puedes cambiar esto para traer más historia
  const until = getYesterdayDate();
  console.log(`🚀 Iniciando ETL: ${since} -> ${until} | Nivel Alcance: ${CONFIG.REACH_LEVEL}`);

  // 4. Carga de Catálogos (Diccionarios ID -> Nombre)
  const mapCampaigns = fetchCatalogMap("campaigns");
  const mapAdsets = fetchCatalogMap("adsets");
  
  // 5. Carga de Anuncios
  const adsList = fetchAllPages(`/${ACCOUNT_ID}/ads`, {
    fields: "id,name,adset_id,campaign_id",
    limit: 500
  });

  // 6. Índice de Alcance Único
  let reachIndex = null;
  const assignedReachKeys = new Set();
  
  if (CONFIG.REACH_LEVEL !== 'ad') {
    console.log("🔄 Generando índice de alcance único...");
    reachIndex = fetchReachIndex(CONFIG.REACH_LEVEL, since, until);
  }

  // 7. Procesamiento de Insights
  const dataBuffer = [];
  let processedCount = 0;

  for (const ad of adsList) {
    // Check de tiempo de ejecución
    if (Date.now() - startTime > CONFIG.MAX_EXECUTION_MS) {
      console.warn("⚠️ Tiempo límite alcanzado. Guardando progreso parcial...");
      break;
    }

    try {
      const insights = fetchAllPages(`/${ad.id}/insights`, {
        fields: "date_start,reach,impressions,frequency,clicks,cpc,ctr,spend,actions,cost_per_action_type",
        time_increment: 1,
        "time_range[since]": since,
        "time_range[until]": until
      });

      insights.forEach(row => {
        const spend = parseFloat(row.spend || 0);
        if (spend <= 0) return; // Optimización: Saltamos días sin gasto

        // Lógica de Resultados (Leads)
        const results = sumActionValues(row.actions, ['lead']);
        
        // Lógica de WhatsApp (Búsqueda flexible)
        const wspCount = (row.actions || []).reduce((sum, action) => {
          return action.action_type.includes("messaging_conversation_started") 
            ? sum + parseInt(action.value, 10) 
            : sum;
        }, 0);

        // Lógica de Alcance Único
        let finalReach = parseInt(row.reach || 0, 10);
        
        if (CONFIG.REACH_LEVEL !== 'ad') {
          const groupId = (CONFIG.REACH_LEVEL === 'campaign') ? ad.campaign_id : ad.adset_id;
          const key = `${CONFIG.REACH_LEVEL}:${groupId}:${row.date_start}`;
          
          if (!assignedReachKeys.has(key)) {
            finalReach = reachIndex[key] || 0;
            assignedReachKeys.add(key); 
          } else {
            finalReach = 0;
          }
        }

        const costPerResult = sumActionValues(row.cost_per_action_type, ['lead']);

        dataBuffer.push([
          mapCampaigns[ad.campaign_id] || ad.campaign_id,
          mapAdsets[ad.adset_id] || ad.adset_id,
          ad.name,
          row.date_start,
          results,
          finalReach,
          parseInt(row.impressions || 0, 10),
          parseFloat(row.frequency || 0),
          costPerResult,
          spend,
          parseFloat(row.ctr || 0) / 100,
          wspCount
        ]);
      });

      processedCount++;
    } catch (e) {
      console.error(`❌ Error en anuncio ${ad.id}: ${e.message}`);
    }
  }

  // 8. Escritura en Batch
  if (dataBuffer.length > 0) {
    dataBuffer.sort((a, b) => a[3].localeCompare(b[3])); // Ordenar por fecha
    sheet.getRange(2, 1, dataBuffer.length, HEADERS.length).setValues(dataBuffer);
    formatSheet(sheet);
    
    console.log(`✅ Carga Completa. Filas: ${dataBuffer.length}`);
    sendEmail(true, processedCount, dataBuffer.length);
  } else {
    console.log("⚠️ No se encontraron datos para el rango seleccionado.");
  }
}

/**
 * ==========================================
 * CAPA DE API (HELPER GENÉRICO)
 * ==========================================
 */
function fetchAllPages(endpoint, params) {
  let url = buildUrl(endpoint, params);
  const result = [];
  
  while (url) {
    const response = fetchWithRetry(url);
    const json = JSON.parse(response.getContentText());
    
    if (json.error) throw new Error(`Meta API Error: ${json.error.message}`);
    if (json.data) result.push(...json.data);
    
    url = (json.paging && json.paging.next) ? json.paging.next : null;
    if (url) Utilities.sleep(100); 
  }
  return result;
}

function fetchWithRetry(url) {
  let attempts = 0;
  let sleepTime = 1000;
  
  while (attempts < CONFIG.RETRY_LIMIT) {
    try {
      const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      const code = resp.getResponseCode();
      
      if (code >= 200 && code < 300) return resp;
      
      if (code === 429 || code >= 500) { 
        Utilities.sleep(sleepTime);
        sleepTime *= 2; 
        attempts++;
      } else {
        throw new Error(`HTTP ${code}: ${resp.getContentText()}`);
      }
    } catch (e) {
      if (attempts >= CONFIG.RETRY_LIMIT - 1) throw e;
      attempts++;
      Utilities.sleep(sleepTime);
    }
  }
}

function buildUrl(path, params) {
  let baseUrl = path.startsWith("http") ? path : `https://graph.facebook.com/${CONFIG.API_VERSION}${path}`;
  if (!params) return baseUrl;
  
  const queryString = Object.keys(params)
    .map(key => `${key}=${encodeURIComponent(params[key])}`)
    .join("&");
    
  return `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}${queryString}&access_token=${ACCESS_TOKEN}`;
}

/**
 * ==========================================
 * UTILITIES & HELPERS
 * ==========================================
 */
function fetchCatalogMap(type) {
  const list = fetchAllPages(`/${ACCOUNT_ID}/${type}`, { fields: "id,name", limit: 1000 });
  const map = {};
  list.forEach(item => map[item.id] = item.name);
  return map;
}

function fetchReachIndex(level, since, until) {
  const idField = `${level}_id`;
  const list = fetchAllPages(`/${ACCOUNT_ID}/insights`, {
    level: level,
    fields: `${idField},date_start,reach`,
    time_increment: 1,
    "time_range[since]": since,
    "time_range[until]": until,
    limit: 500
  });
  
  const index = {};
  list.forEach(row => {
    const key = `${level}:${row[idField]}:${row.date_start}`;
    index[key] = parseInt(row.reach || 0, 10);
  });
  return index;
}

function sumActionValues(actionsArray, filterTypes) {
  if (!actionsArray || !Array.isArray(actionsArray)) return 0;
  return actionsArray.reduce((acc, item) => {
    if (!filterTypes || filterTypes.includes(item.action_type)) {
      return acc + parseFloat(item.value || 0);
    }
    return acc;
  }, 0);
}

function getYesterdayDate() {
  const dt = new Date();
  dt.setDate(dt.getDate() - 1);
  return Utilities.formatDate(dt, CONFIG.TZ, "yyyy-MM-dd");
}

function formatSheet(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 9, lastRow - 1, 2).setNumberFormat("$#,##0");
    sheet.getRange(2, 11, lastRow - 1, 1).setNumberFormat("0.00%");
    sheet.getRange(2, 5, lastRow - 1, 4).setNumberFormat("#,##0");
    sheet.getRange(2, 12, lastRow - 1, 1).setNumberFormat("#,##0");
  }
}

function sendEmail(isSuccess, processedCount, totalRows) {
  // Evitar envío si el mail es el de ejemplo
  if (CONFIG.EMAILS.SUCCESS.includes("ejemplo.com")) return;

  const subject = isSuccess ? "✅ Reporte Meta Ads Actualizado" : "🚨 Error en Reporte Meta Ads";
  const body = isSuccess 
    ? `Carga completada.\nAnuncios Procesados: ${processedCount}\nFilas Generadas: ${totalRows}\nNivel Alcance: ${CONFIG.REACH_LEVEL}`
    : `Ocurrió un error en la ejecución. Revisa los logs.`;

  try {
    MailApp.sendEmail(isSuccess ? CONFIG.EMAILS.SUCCESS : CONFIG.EMAILS.ERROR, subject, body);
  } catch (e) {
    console.log("Error enviando email: " + e.message);
  }
}
