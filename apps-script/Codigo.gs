/**
 * Autodiagnóstico de convivencia · Fundación Eventuras
 *
 * Qué hace cada envío: escribe una fila en la planilla y manda el informe por correo
 * a quien respondió, con copia interna.
 *
 * Qué NO hace, y es a propósito: no guarda ningún PDF. El informe se arma en el correo
 * y en la página. Mientras menos quede almacenado, menos hay que entregar si alguna vez
 * llega un requerimiento, y menos riesgo de exponer a un colegio que respondió con
 * honestidad.
 *
 * Dónde vive: proyecto de Apps Script en la cuenta contacto@eventuras.org.
 * Para que un cambio salga al aire hay que hacer
 * Implementar → Gestionar implementaciones → editar → versión nueva.
 */

const CONFIG = {
  PLANILLA: '',                       // ← pega acá el ID de la planilla de respuestas
  HOJA: 'Respuestas',
  COPIA_INTERNA: 'fransaez@eventuras.org',
  REMITENTE: 'Fundación Eventuras',
  SITIO: 'https://diagnostico.eventuras.org',
  RETENCION_MESES: 12                 // se informa en el correo y se aplica con limpiar()
};

const VERDE = '#93C11F', VERDE_HONDO = '#6E9112', TINTA = '#383838',
      TINTA_MEDIA = '#6E6E6E', LINEA = '#E4E4DE', FONDO = '#F7F7F4';

const ITEMS_ORDEN = ['1.1','1.2','1.3','2.1','2.2','2.3','2.4','3.1','3.2','3.3',
                     '4.1','4.2','4.3','5.1','5.2','5.3'];
const OPC_ORDEN = ['O.1','O.2','O.3'];
const NIVEL = ['Sin instalar','Inicial','En práctica','Consolidado'];
const DIMS_ORDEN = ['sala','adultos','cultura','liderazgo','comunidad'];

/* ===================== entrada ===================== */

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    if (!d || !d.contacto || !d.contacto.correo) return ok('sin correo');
    guardarFila(d);
    enviarCorreo(d);
    return ok('listo');
  } catch (err) {
    avisarError(err, e);
    return ok('error');
  }
}

function doGet() {
  return ContentService.createTextOutput('Autodiagnóstico de convivencia · activo')
    .setMimeType(ContentService.MimeType.TEXT);
}

function ok(msg) {
  return ContentService.createTextOutput(JSON.stringify({estado: msg}))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ===================== planilla ===================== */

function encabezados() {
  return ['Fecha','Folio','Versión','RBD','Establecimiento','Comuna','Región','Dependencia','Matrícula',
          'Cargo','Ciclo','Nombre','Correo','Teléfono','Autoriza material',
          'Estado La sala','Estado Los adultos','Estado Cultura','Estado Liderazgo','Estado Comunidad',
          'Foco','Acción 1','Acción 2','Acción 3','Lecturas',
          'N distinto por ciclo','N no sabe']
    .concat(ITEMS_ORDEN.map(function(i){ return 'P ' + i; }))
    .concat(OPC_ORDEN.map(function(i){ return 'Opc ' + i; }))
    .concat(['Consentimiento']);
}

function hoja() {
  const ss = SpreadsheetApp.openById(CONFIG.PLANILLA);
  let sh = ss.getSheetByName(CONFIG.HOJA);
  if (!sh) sh = ss.insertSheet(CONFIG.HOJA);
  if (sh.getLastRow() === 0) {
    const h = encabezados();
    sh.appendRow(h);
    sh.getRange(1, 1, 1, h.length).setFontWeight('bold').setBackground('#F3F9E4');
    sh.setFrozenRows(1);
  }
  return sh;
}

function guardarFila(d) {
  if (!CONFIG.PLANILLA) return;
  const c = d.colegio || {};
  const et = function(id) {
    const v = (d.respuestas || {})[id];
    if (v === undefined) v = (d.opcionales || {})[id];
    if (typeof v === 'number') return NIVEL[v];
    if (v === 'nose') return 'No lo sé';
    if (v === 'na') return 'No aplica';
    return '';
  };
  const banda = function(k) { return d.bandas && d.bandas[k] ? d.bandas[k].estado : ''; };
  const acc = function(i) { return d.acciones && d.acciones[i] ? d.acciones[i].titulo : ''; };

  const fila = [
    new Date(d.fecha || Date.now()), d.folio || '', d.version || '',
    c.rbd || '', c.nombre || '', c.comuna || '', c.region || '', c.dep || '', c.mat || '',
    d.cargo || '', d.ciclo || '',
    d.contacto.nombre || '', d.contacto.correo || '', d.contacto.tel || '',
    d.contacto.mkt ? 'Sí' : 'No'
  ];
  DIMS_ORDEN.forEach(function(k){ fila.push(banda(k)); });
  fila.push(d.foco ? (d.foco.id + ' · ' + d.foco.titulo) : '');
  fila.push(acc(0), acc(1), acc(2));
  fila.push((d.lecturas || []).join(' | '));
  fila.push((d.distintoCiclo || []).length, (d.noSabe || []).length);
  ITEMS_ORDEN.forEach(function(id){ fila.push(et(id)); });
  OPC_ORDEN.forEach(function(id){ fila.push(et(id)); });
  fila.push(d.consentimiento ? d.consentimiento.informe : '');

  hoja().appendRow(fila);
}

/* ===================== correo ===================== */

function enviarCorreo(d) {
  const c = d.colegio || {};
  const asunto = 'Tu autodiagnóstico de convivencia · ' + (c.nombre || 'tu establecimiento');
  const html = cuerpoCorreo(d);
  const opciones = {
    name: CONFIG.REMITENTE,
    htmlBody: html,
    replyTo: Session.getEffectiveUser().getEmail()
  };
  if (CONFIG.COPIA_INTERNA) opciones.bcc = CONFIG.COPIA_INTERNA;
  MailApp.sendEmail(d.contacto.correo, asunto, textoPlano(d), opciones);
}

function cuerpoCorreo(d) {
  const c = d.colegio || {};
  const est = function(k) { return d.bandas && d.bandas[k] ? d.bandas[k] : null; };

  let bandas = '';
  DIMS_ORDEN.forEach(function(k) {
    const b = est(k); if (!b) return;
    bandas += '<tr>' +
      '<td style="padding:9px 0;border-bottom:1px solid ' + LINEA + ';font-size:14px;color:' + TINTA + '">' + esc(b.nombre) + '</td>' +
      '<td style="padding:9px 0;border-bottom:1px solid ' + LINEA + ';font-size:13px;font-weight:bold;color:' + VERDE_HONDO + ';text-align:right;white-space:nowrap">' + esc(b.estado) + '</td>' +
      '</tr>';
  });

  let acciones = '';
  (d.acciones || []).forEach(function(a, i) {
    acciones += '<tr><td style="padding:0 0 16px 0">' +
      '<div style="font-size:15px;font-weight:bold;color:' + TINTA + '">' + (i + 1) + '. ' + esc(a.titulo) + '</div>' +
      '<div style="font-size:14px;color:' + TINTA_MEDIA + ';line-height:1.5;margin-top:4px">' + esc(a.detalle) + '</div>' +
      '<div style="font-size:12px;font-weight:bold;color:' + VERDE_HONDO + ';margin-top:6px">' + esc(a.ventana) + '</div>' +
      '</td></tr>';
  });

  let lect = '';
  (d.lecturas || []).forEach(function(t) {
    lect += '<div style="font-size:14px;color:' + TINTA + ';padding:7px 0;border-bottom:1px solid ' + LINEA + '">' + esc(t) + '</div>';
  });

  const foco = d.foco ? (
    '<div style="background:#F3F9E4;border:1px solid ' + VERDE + ';border-radius:12px;padding:16px;margin:0 0 24px 0">' +
    '<div style="font-size:11px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:' + VERDE_HONDO + '">Por dónde conviene partir</div>' +
    '<div style="font-size:16px;font-weight:bold;color:' + TINTA + ';margin-top:5px">' + esc(d.foco.titulo) + '</div>' +
    '<div style="font-size:14px;color:' + TINTA_MEDIA + ';line-height:1.5;margin-top:8px"><b style="color:' + TINTA + '">Lo que marcaste:</b> ' + esc(d.foco.hoy) + '</div>' +
    (d.foco.siguiente ? '<div style="font-size:14px;color:' + TINTA_MEDIA + ';line-height:1.5;margin-top:7px"><b style="color:' + TINTA + '">El paso siguiente:</b> ' + esc(d.foco.siguiente) + '</div>' : '') +
    '</div>') : '';

  return '' +
  '<div style="margin:0;padding:0;background:' + FONDO + ';font-family:Nunito,Segoe UI,Helvetica,Arial,sans-serif">' +
  '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + FONDO + ';padding:24px 12px">' +
  '<tr><td align="center">' +
  '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:14px;overflow:hidden;border:1px solid ' + LINEA + '">' +

  '<tr><td style="background:' + VERDE + ';padding:20px 24px">' +
    '<div style="font-size:11px;font-weight:bold;letter-spacing:1.4px;text-transform:uppercase;color:#1F2A08;opacity:.75">Autodiagnóstico de convivencia</div>' +
    '<div style="font-size:21px;font-weight:bold;color:#1F2A08;margin-top:3px;line-height:1.2">' + esc(c.nombre || 'Tu establecimiento') + '</div>' +
    (c.comuna ? '<div style="font-size:13px;font-weight:bold;color:#1F2A08;opacity:.85;margin-top:5px">' + esc([c.comuna, c.region].filter(Boolean).join(' · ')) + '</div>' : '') +
  '</td></tr>' +

  '<tr><td style="padding:24px">' +
    '<p style="margin:0 0 20px 0;font-size:15px;line-height:1.55;color:' + TINTA + '">Hola ' + esc((d.contacto.nombre || '').split(' ')[0]) + ', acá va el resumen de lo que respondiste. El informe completo, con las lecturas cruzadas y la sección del Plan de Gestión, está en la página.</p>' +

    '<div style="font-size:11px;font-weight:bold;letter-spacing:1.2px;text-transform:uppercase;color:' + VERDE_HONDO + ';margin-bottom:10px">Tu perfil</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">' + bandas + '</table>' +

    foco +

    (acciones ? '<div style="font-size:11px;font-weight:bold;letter-spacing:1.2px;text-transform:uppercase;color:' + VERDE_HONDO + ';margin-bottom:12px">Tres acciones, en este orden</div>' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px">' + acciones + '</table>' : '') +

    (lect ? '<div style="font-size:11px;font-weight:bold;letter-spacing:1.2px;text-transform:uppercase;color:' + VERDE_HONDO + ';margin:16px 0 8px 0">Qué se lee al cruzar tus respuestas</div>' + lect : '') +

    '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 8px 0"><tr><td style="background:' + VERDE + ';border-radius:99px">' +
      '<a href="' + CONFIG.SITIO + '" style="display:inline-block;padding:13px 24px;font-size:14px;font-weight:bold;color:#1F2A08;text-decoration:none">Volver al informe completo</a>' +
    '</td></tr></table>' +

    '<p style="margin:20px 0 0 0;font-size:13px;line-height:1.55;color:' + TINTA_MEDIA + '">Si quieres ver las diferencias entre lo que ve cada parte del equipo, pídele a dos personas más que respondan desde otro cargo y otro ciclo. Son seis minutos a cada una.</p>' +
  '</td></tr>' +

  '<tr><td style="padding:16px 24px 22px 24px;border-top:1px solid ' + LINEA + '">' +
    '<p style="margin:0;font-size:11px;line-height:1.55;color:#9B9B9B">' +
      'Tus respuestas son confidenciales. No entregamos resultados individuales a tu sostenedor, al Ministerio ni a ninguna otra institución. ' +
      'Las guardamos por ' + CONFIG.RETENCION_MESES + ' meses y después quedan sin identificación del establecimiento. ' +
      'Para pedir que las borremos antes, responde este correo.' +
    '</p>' +
    '<p style="margin:10px 0 0 0;font-size:11px;color:#9B9B9B">Folio ' + esc(d.folio || '') + ' · Corporación Educacional Eduventuras · contacto@eventuras.org</p>' +
  '</td></tr>' +

  '</table></td></tr></table></div>';
}

function textoPlano(d) {
  const c = d.colegio || {};
  let t = 'Autodiagnóstico de convivencia\n' + (c.nombre || '') + '\n\n';
  DIMS_ORDEN.forEach(function(k) {
    const b = d.bandas && d.bandas[k]; if (b) t += b.nombre + ': ' + b.estado + '\n';
  });
  if (d.foco) t += '\nPor dónde conviene partir: ' + d.foco.titulo + '\n';
  (d.acciones || []).forEach(function(a, i) { t += '\n' + (i + 1) + '. ' + a.titulo + ' (' + a.ventana + ')\n' + a.detalle + '\n'; });
  t += '\nInforme completo: ' + CONFIG.SITIO + '\n';
  return t;
}

/* ===================== utilidades ===================== */

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function avisarError(err, e) {
  try {
    MailApp.sendEmail(CONFIG.COPIA_INTERNA, 'Autodiagnóstico · error en un envío',
      String(err) + '\n\n' + (e && e.postData ? e.postData.contents : 'sin cuerpo'));
  } catch (x) {}
}

/**
 * Limpieza de datos personales. Deja la fila para el análisis agregado y borra
 * el nombre, el correo, el teléfono y el RBD de todo lo que pasó la retención.
 * Conviene dejarlo corriendo con un activador mensual.
 */
function limpiar() {
  if (!CONFIG.PLANILLA) return;
  const sh = hoja();
  const n = sh.getLastRow();
  if (n < 2) return;
  const corte = new Date();
  corte.setMonth(corte.getMonth() - CONFIG.RETENCION_MESES);
  const datos = sh.getRange(2, 1, n - 1, sh.getLastColumn()).getValues();
  for (let i = 0; i < datos.length; i++) {
    const f = datos[i][0];
    if (f instanceof Date && f < corte && datos[i][12]) {
      sh.getRange(i + 2, 4).setValue('');   // RBD
      sh.getRange(i + 2, 12, 1, 3).setValues([['', '', '']]); // nombre, correo, teléfono
    }
  }
}

/** Para probar el correo sin pasar por la página. */
function prueba() {
  enviarCorreo({
    folio: 'AD-PRUEBA', fecha: new Date().toISOString(),
    colegio: {nombre: 'Colegio de prueba', comuna: 'Puerto Varas', region: 'Los Lagos', rbd: '7743'},
    cargo: 'Director o directora', ciclo: 'Educación básica',
    bandas: {sala:{nombre:'Lo que pasa en la sala',estado:'Prácticas aisladas'},
             adultos:{nombre:'Capacidad de los adultos',estado:'En instalación'},
             cultura:{nombre:'Cultura y espacios compartidos',estado:'Prácticas aisladas'},
             liderazgo:{nombre:'Liderazgo y gestión',estado:'En instalación'},
             comunidad:{nombre:'Comunidad educativa',estado:'Avance desigual'}},
    foco: {id:'4.2', titulo:'Correspondencia entre prioridad declarada y recursos asignados',
           hoy:'Hay horas asignadas a una persona.', siguiente:'Existe tiempo protegido para el equipo.'},
    acciones: [{titulo:'Proteger el tiempo del equipo por escrito', detalle:'Dejar definido qué parte del consejo se destina a este trabajo.', ventana:'Antes de que parta el año'}],
    lecturas: ['Hay formación y todavía no hay acompañamiento después'],
    contacto: {nombre: 'Prueba', correo: Session.getEffectiveUser().getEmail(), tel: '', mkt: false},
    consentimiento: {informe: 'prueba'}
  });
}
