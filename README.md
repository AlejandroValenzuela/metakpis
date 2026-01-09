# 🚀 Meta Ads to Google Sheets (Free Connector)

Un script de **Google Apps Script** para extraer métricas de Meta Ads (Facebook/Instagram) automáticamente hacia Google Sheets, sin pagar suscripciones mensuales (Supermetrics, Windsor, etc.).

## ⚡ Features
* **Costo $0:** Usa la API nativa de Meta.
* **Automático:** Se ejecuta cada madrugada.
* **Granularidad:** Extrae Costos, Impresiones, Clics, Leads y Conversaciones de WhatsApp.
* **Seguro:** Usa `ScriptProperties` para no exponer tus tokens.

## 🛠️ Instalación Rápida

### Opción A: Usar la Plantilla (Recomendado)
1.  [Haz clic aquí para obtener tu copia de la Google Sheet](https://docs.google.com/spreadsheets/d/1yth2Zm8QE0Fi58YoL62wPbx7zokPrFE1koQ7czORqlM/edit?gid=0#gid=0/copy)
2.  Ve a **Extensiones > Apps Script**.
3.  Configura tus claves en **Configuración del Proyecto > Propiedades de secuencia de comandos**:
    * `META_ACCESS_TOKEN`: Tu token (EA...)
    * `META_ACCOUNT_ID`: Tu ID de cuenta (act_...)
4.  Ejecuta la función `obtenerInsightsDesdeEnero`.

### Opción B: Código Manual
1.  Crea una Sheet nueva.
2.  Abre Extensiones > Apps Script.
3.  Copia el contenido del archivo `Code.js` de este repositorio.
4.  Configura las Propiedades del Script (Token e ID).

## 👨‍💻 Autor
**Felipe Valenzuela** - *Growth Engineer & Full Stack Marketer*
[LinkedIn](https://www.linkedin.com/in/felipe-valenzuela-carrasco/)
