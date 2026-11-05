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
    let v = (d.respuestas || {})[id];
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
  const radar = imagenRadar(d.radarPng);
  const opciones = {
    name: CONFIG.REMITENTE,
    htmlBody: cuerpoCorreo(d, !!radar),
    replyTo: Session.getEffectiveUser().getEmail()
  };
  if (radar) opciones.inlineImages = { radar: radar };
  if (CONFIG.COPIA_INTERNA) opciones.bcc = CONFIG.COPIA_INTERNA;
  MailApp.sendEmail(d.contacto.correo, asunto, textoPlano(d), opciones);
}

/* El gráfico llega desde la página como PNG en base64. Solo se acepta si de verdad
   es un PNG y pesa menos de 400 KB; si no, el correo sale igual, sin gráfico. */
function imagenRadar(b64) {
  try {
    if (!b64 || typeof b64 !== 'string' || b64.length > 550000) return null;
    const bytes = Utilities.base64Decode(b64);
    const firma = [137, 80, 78, 71];
    for (let i = 0; i < 4; i++) if ((bytes[i] & 255) !== firma[i]) return null;
    return Utilities.newBlob(bytes, 'image/png', 'perfil.png');
  } catch (e) { return null; }
}

/* Colores de las etiquetas de estado, iguales a los de la página. */
const PILDORA = {
  b3: ['#F3F9E4', VERDE_HONDO, VERDE],
  b2: ['#FFF7E3', '#8A6A12', '#E8C76A'],
  b1: ['#FDEEEE', '#E25D5D', '#E25D5D'],
  b0: [FONDO, '#9B9B9B', LINEA]
};

function titulo(t, arriba) {
  return '<div style="font-size:11px;font-weight:bold;letter-spacing:1.2px;text-transform:uppercase;color:' + VERDE_HONDO +
    ';margin:' + (arriba === false ? '0' : '28px') + ' 0 10px 0;padding-top:' + (arriba === false ? '0' : '22px') +
    ';border-top:' + (arriba === false ? '0' : '1px solid ' + LINEA) + '">' + esc(t) + '</div>';
}

function parrafo(t, extra) {
  return '<p style="margin:0 0 12px 0;font-size:13px;line-height:1.55;color:' + TINTA_MEDIA + (extra || '') + '">' + t + '</p>';
}

function cuerpoCorreo(d, conRadar) {
  const c = d.colegio || {};
  let h = '';

  /* ---- tu perfil ---- */
  h += titulo('Tu perfil', false);
  h += parrafo('Las dieciséis preguntas que respondiste se agrupan en cinco dimensiones. El estado de cada una resume en qué momento están sus prácticas, según lo que marcaste.');
  if (conRadar) {
    h += '<div style="text-align:center;margin:6px 0 10px 0"><img src="cid:radar" width="340" height="268" alt="Perfil de las cinco dimensiones" style="display:inline-block;max-width:100%;height:auto;border:0"></div>';
  }
  let bandas = '';
  DIMS_ORDEN.forEach(function(k) {
    const b = d.bandas && d.bandas[k]; if (!b) return;
    const p = PILDORA[b.clase] || PILDORA.b0;
    bandas += '<tr>' +
      '<td style="padding:9px 0;border-bottom:1px solid ' + LINEA + ';font-size:14px;font-weight:bold;color:' + TINTA + '">' + esc(b.nombre) + '</td>' +
      '<td style="padding:9px 0;border-bottom:1px solid ' + LINEA + ';text-align:right;white-space:nowrap">' +
        '<span style="display:inline-block;font-size:11px;font-weight:bold;padding:2px 9px;border-radius:99px;background:' + p[0] + ';color:' + p[1] + ';border:1px solid ' + p[2] + '">' + esc(b.estado) + '</span>' +
      '</td></tr>';
  });
  h += '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + bandas + '</table>';
  h += '<div style="font-size:11px;line-height:1.5;color:' + TINTA_MEDIA + ';margin-top:12px">' +
    '<b style="color:' + TINTA + '">Prácticas aisladas</b> · ocurren por iniciativa de alguien, sin un formato definido que se repita.<br>' +
    '<b style="color:' + TINTA + '">En instalación</b> · hay formato definido y todavía no se aplica de manera pareja.<br>' +
    '<b style="color:' + TINTA + '">Prácticas instaladas</b> · se aplican de forma regular y sobreviven a los cambios de persona.<br>' +
    '<b style="color:' + TINTA + '">Avance desigual</b> · dentro de la misma dimensión conviven prácticas muy instaladas con otras que no han partido.</div>';

  /* ---- lecturas cruzadas ---- */
  const L = d.lecturasDetalle || (d.lecturas || []).map(function(t) { return {titulo: t}; });
  h += titulo('Qué se lee al cruzar tus respuestas');
  if (L.length) {
    L.forEach(function(x) {
      h += '<div style="background:' + FONDO + ';border:1px solid ' + LINEA + ';border-radius:12px;padding:14px 16px;margin-bottom:12px">' +
        '<div style="font-size:15px;font-weight:bold;color:' + TINTA + ';line-height:1.3">' + esc(x.titulo) + '</div>' +
        (x.apoyo && x.apoyo.length ? '<div style="font-size:11px;color:' + TINTA_MEDIA + ';margin-top:6px">Se apoya en: ' + esc(x.apoyo.join(' · ')) + '</div>' : '') +
        (x.lectura ? '<div style="font-size:14px;color:' + TINTA + ';line-height:1.5;margin-top:8px">' + esc(x.lectura) + '</div>' : '') +
        (x.implicancia ? '<div style="font-size:13px;color:' + TINTA_MEDIA + ';line-height:1.5;margin-top:8px;padding-top:8px;border-top:1px solid ' + LINEA + '">' + esc(x.implicancia) + '</div>' : '') +
        '</div>';
    });
  } else {
    h += parrafo('Tus respuestas no muestran por ahora ninguno de los cruces que este instrumento está construido para detectar. El perfil de arriba y la ruta de abajo son la lectura que corresponde hacer con esta información.');
  }

  /* ---- foco ---- */
  if (d.foco) {
    h += titulo('Por dónde conviene partir');
    h += '<div style="background:#F3F9E4;border:1px solid ' + VERDE + ';border-radius:12px;padding:16px">' +
      (d.foco.tramo ? '<div style="font-size:11px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:' + VERDE_HONDO + '">' + esc(d.foco.tramo) + '</div>' : '') +
      '<div style="font-size:16px;font-weight:bold;color:' + TINTA + ';margin-top:5px;line-height:1.3">' + esc(d.foco.titulo) + '</div>' +
      '<div style="font-size:14px;color:' + TINTA_MEDIA + ';line-height:1.5;margin-top:8px"><b style="color:' + TINTA + '">Lo que declaraste:</b> ' + esc(d.foco.hoy) + '</div>' +
      (d.foco.siguiente ? '<div style="font-size:14px;color:' + TINTA_MEDIA + ';line-height:1.5;margin-top:8px;padding-top:8px;border-top:1px solid ' + VERDE + '"><b style="color:' + TINTA + '">El paso siguiente:</b> ' + esc(d.foco.siguiente) + '</div>' : '') +
      (d.foco.porque ? '<div style="font-size:13px;color:' + TINTA_MEDIA + ';line-height:1.5;margin-top:8px;padding-top:8px;border-top:1px solid ' + VERDE + '"><b style="color:' + TINTA + '">Por qué este tramo va primero.</b> ' + esc(d.foco.porque) + '</div>' : '') +
      '</div>';
  }

  /* ---- tres acciones ---- */
  if ((d.acciones || []).length) {
    h += titulo('Tres acciones, en este orden');
    let a = '';
    d.acciones.forEach(function(x, i) {
      a += '<tr><td valign="top" style="padding:0 12px 16px 0;width:26px">' +
          '<div style="width:24px;height:24px;line-height:24px;border-radius:99px;background:#E25D5D;color:#fff;font-size:12px;font-weight:bold;text-align:center">' + (i + 1) + '</div></td>' +
        '<td valign="top" style="padding:0 0 16px 0">' +
          '<div style="font-size:15px;font-weight:bold;color:' + TINTA + ';line-height:1.3">' + esc(x.titulo) + '</div>' +
          '<div style="font-size:14px;color:' + TINTA_MEDIA + ';line-height:1.5;margin-top:3px">' + esc(x.detalle) + '</div>' +
          '<span style="display:inline-block;margin-top:6px;font-size:11px;font-weight:bold;color:' + VERDE_HONDO + ';background:#F3F9E4;border:1px solid ' + VERDE + ';padding:2px 9px;border-radius:99px">' + esc(x.ventana) + '</span>' +
        '</td></tr>';
    });
    h += '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + a + '</table>';
    h += parrafo('El período sugerido indica cuándo cuesta menos instalar cada acción, considerando la jornada de planificación docente de comienzos de marzo y el cierre de la Fase Estratégica del PME el 20 de marzo.', ';font-size:12px;color:#9B9B9B');
  }

  /* ---- lo instalado ---- */
  if ((d.instalado || []).length) {
    h += titulo('Lo que ya tienes instalado');
    d.instalado.forEach(function(x) {
      h += '<div style="font-size:14px;color:' + TINTA + ';padding:4px 0"><span style="color:' + VERDE + ';font-weight:bold">●</span>&nbsp; ' + esc(x.titulo) + '</div>';
    });
  }

  /* ---- plan de gestión ---- */
  if ((d.plan || []).length) {
    h += titulo('Dónde entra cada parte en tu Plan de Gestión');
    let p = '';
    d.plan.forEach(function(x) {
      p += '<tr><td style="padding:8px 0;border-bottom:1px solid ' + LINEA + ';font-size:13px;color:' + TINTA + '">' + esc(x.letra) + ') ' + esc(x.contenido) + '</td>' +
        '<td style="padding:8px 0 8px 12px;border-bottom:1px solid ' + LINEA + ';font-size:13px;font-weight:bold;text-align:right;white-space:nowrap;color:' + (x.preguntas ? VERDE_HONDO : '#E25D5D') + '">' +
        esc(x.preguntas || 'sin cubrir') + '</td></tr>';
    });
    h += '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + p + '</table>';
    h += parrafo('Contenidos mínimos del artículo 16 D de la Ley 21.809, con el número de la pregunta que los toca. Este informe describe prácticas declaradas por quien respondió. No evalúa ni certifica el cumplimiento de normativa educacional.', ';font-size:12px;color:#9B9B9B;margin-top:10px');
  }

  /* ---- todas las respuestas ---- */
  if ((d.detalle || []).length) {
    h += titulo('Todas tus respuestas');
    let r = '';
    d.detalle.forEach(function(x) {
      r += '<tr><td style="padding:6px 0;border-bottom:1px solid ' + LINEA + ';font-size:12px;color:' + TINTA + '">' + esc(x.id) + ' · ' + esc(x.pregunta) +
          (x.distinto ? ' <span style="color:#9B9B9B">· distinto en otros ciclos</span>' : '') + '</td>' +
        '<td style="padding:6px 0 6px 12px;border-bottom:1px solid ' + LINEA + ';font-size:12px;font-weight:bold;text-align:right;white-space:nowrap;color:' + TINTA + '">' + esc(x.respuesta) + '</td></tr>';
    });
    h += '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + r + '</table>';
    h += parrafo('Guarda este correo. En 2027 puedes volver a responder y comparar.', ';font-size:12px;color:#9B9B9B;margin-top:10px');
  }

  /* ---- quién hizo ---- */
  h += titulo('Quién hizo este instrumento');
  h += '<p style="margin:0;font-size:14px;line-height:1.5;color:' + TINTA + '">Fundación Eventuras acompaña a colegios en formación docente y aprendizaje socioemocional. Representante y socio implementador de Second Step en Chile. Programas alineados al marco CASEL.</p>';
  h += '<p style="margin:8px 0 0 0;font-size:14px"><a href="https://www.eventuras.org" style="color:' + VERDE_HONDO + '">eventuras.org</a> · contacto@eventuras.org</p>';

  h += '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 6px 0"><tr><td style="background:' + VERDE + ';border-radius:99px">' +
    '<a href="' + CONFIG.SITIO + '" style="display:inline-block;padding:13px 24px;font-size:14px;font-weight:bold;color:#1F2A08;text-decoration:none">Invitar a otra persona del equipo</a>' +
    '</td></tr></table>';
  h += parrafo('Con dos respuestas más del mismo colegio, desde otro cargo o sobre otra parte del establecimiento, aparecen las diferencias entre lo que ve cada uno. Son seis minutos a cada una.', ';font-size:12px');

  const lugar = [c.comuna, c.region, c.rbd ? 'RBD ' + c.rbd : null].filter(Boolean).join(' · ');
  const quien = [d.cargo, d.ciclo ? 'Alcance: ' + d.ciclo : null].filter(Boolean).join(' · ');

  return '' +
  '<div style="margin:0;padding:0;background:' + FONDO + ';font-family:Nunito,Segoe UI,Helvetica,Arial,sans-serif">' +
  '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + FONDO + ';padding:24px 12px">' +
  '<tr><td align="center">' +
  '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:14px;overflow:hidden;border:1px solid ' + LINEA + '">' +

  '<tr><td style="background:' + VERDE + ';padding:20px 24px">' +
    '<div style="font-size:11px;font-weight:bold;letter-spacing:1.4px;text-transform:uppercase;color:#1F2A08;opacity:.75">Autodiagnóstico de convivencia</div>' +
    '<div style="font-size:21px;font-weight:bold;color:#1F2A08;margin-top:3px;line-height:1.2">' + esc(c.nombre || 'Tu establecimiento') + '</div>' +
    (lugar ? '<div style="font-size:13px;font-weight:bold;color:#1F2A08;opacity:.85;margin-top:5px">' + esc(lugar) + '</div>' : '') +
  '</td></tr>' +

  '<tr><td style="padding:24px">' +
    '<p style="margin:0 0 22px 0;font-size:15px;line-height:1.55;color:' + TINTA + '">Hola ' + esc((d.contacto.nombre || '').split(' ')[0]) +
      ', este es tu informe completo. Guarda este correo: es tu copia del autodiagnóstico.</p>' +
    h +
  '</td></tr>' +

  '<tr><td style="padding:16px 24px 22px 24px;border-top:1px solid ' + LINEA + '">' +
    '<p style="margin:0;font-size:11px;line-height:1.55;color:#9B9B9B">' +
      'Tus respuestas son confidenciales. No entregamos resultados individuales a tu sostenedor, al Ministerio ni a ninguna otra institución. ' +
      'Las guardamos por ' + CONFIG.RETENCION_MESES + ' meses y después quedan sin identificación del establecimiento. ' +
      'Para pedir que las borremos antes, responde este correo.' +
    '</p>' +
    '<p style="margin:10px 0 0 0;font-size:11px;color:#9B9B9B">Folio ' + esc(d.folio || '') + (quien ? ' · ' + esc(quien) : '') +
      ' · Corporación Educacional Eduventuras · contacto@eventuras.org</p>' +
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
  t += '\nAutodiagnóstico: ' + CONFIG.SITIO + '\n';
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
    cargo: 'Director o directora', ciclo: 'Solo educación básica',
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
