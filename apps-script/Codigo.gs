/**
 * Autodiagnóstico de convivencia educativa · Fundación Eventuras
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
const NIVEL = ['Nivel 1 de 4','Nivel 2 de 4','Nivel 3 de 4','Nivel 4 de 4'];
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
  return ContentService.createTextOutput('Autodiagnóstico de convivencia educativa · activo')
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
          'Foco','Acción 1','Acción 2','Acción 3','Lecturas','Avisos',
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
  fila.push((d.avisos || []).join(' | '));
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
  b3: ['#F3F9E4', VERDE_HONDO, VERDE, 'solid'],
  b2: ['#FFF7E3', '#8A6A12', '#E8C76A', 'solid'],
  b1: ['#FDEEEE', '#E25D5D', '#E25D5D', 'solid'],
  'b-disp': ['#FFFFFF', TINTA_MEDIA, '#9B9B9B', 'dashed'],
  'b-sin': [FONDO, '#9B9B9B', LINEA, 'solid']
};

function titulo(t, arriba) {
  return '<div style="font-size:11px;font-weight:bold;letter-spacing:1.2px;text-transform:uppercase;color:' + VERDE_HONDO +
    ';margin:' + (arriba === false ? '0' : '28px') + ' 0 10px 0;padding-top:' + (arriba === false ? '0' : '22px') +
    ';border-top:' + (arriba === false ? '0' : '1px solid ' + LINEA) + '">' + esc(t) + '</div>';
}

function parrafo(t, extra) {
  return '<p style="margin:0 0 12px 0;font-size:13px;line-height:1.55;color:' + TINTA_MEDIA + (extra || '') + '">' + t + '</p>';
}

function chips(lista) {
  return (lista || []).map(function(s) {
    return '<span style="display:inline-block;margin:0 5px 5px 0;font-size:11px;font-weight:bold;color:' + TINTA_MEDIA +
      ';background:#fff;border:1px solid ' + LINEA + ';padding:2px 8px;border-radius:99px">' + esc(s) + '</span>';
  }).join('');
}

function caja(contenido, fondo, borde) {
  return '<div style="background:' + (fondo || FONDO) + ';border:1px solid ' + (borde || LINEA) + ';border-radius:12px;padding:14px 16px;margin-bottom:12px">' + contenido + '</div>';
}

/* El correo sigue el mismo orden que el informe en pantalla. Los textos que dependen de las
   respuestas llegan calculados desde la página; acá solo se les da formato. */
function cuerpoCorreo(d, conRadar) {
  const c = d.colegio || {};
  const A = d.acciones || [];
  const minus = function(s) { return String(s || '').toLowerCase(); };
  let h = '';

  /* ---- en resumen ---- */
  if (d.resumen) {
    const r = d.resumen;
    let res = '<div style="font-size:11px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:' + VERDE_HONDO + '">En resumen</div>' +
      '<div style="font-size:15px;line-height:1.45;color:' + TINTA + ';margin-top:5px">De las dieciséis prácticas, ' + r.bajos +
      ' quedaron en los dos primeros niveles y ' + r.altos + ' en los dos más altos' +
      (r.sin ? ', y ' + r.sin + (r.sin === 1 ? ' quedó' : ' quedaron') + ' sin responder' : '') + '.</div>';
    if (d.foco) {
      res += '<div style="margin-top:10px;padding-top:9px;border-top:1px solid ' + VERDE + '">' +
        '<div style="font-size:11px;font-weight:bold;letter-spacing:.8px;text-transform:uppercase;color:' + VERDE_HONDO + '">Por dónde partiríamos</div>' +
        '<div style="font-size:15px;color:' + TINTA + ';line-height:1.45">' + esc(d.foco.titulo) + '</div>';
      if (A.length) {
        res += '<div style="font-size:11px;font-weight:bold;letter-spacing:.8px;text-transform:uppercase;color:' + VERDE_HONDO + ';margin-top:8px">Primer movimiento</div>' +
          '<div style="font-size:15px;color:' + TINTA + ';line-height:1.45">' + esc(A[0].titulo) + '</div>' +
          '<span style="display:inline-block;margin-top:6px;font-size:11px;font-weight:bold;color:' + VERDE_HONDO + ';background:#fff;border:1px solid ' + VERDE + ';padding:2px 9px;border-radius:99px">' + esc(A[0].ventana) + '</span>';
      }
      res += '</div>';
    }
    h += caja(res, '#F3F9E4', VERDE);
  }

  /* ---- tu perfil ---- */
  h += titulo('Tu perfil');
  h += parrafo('Respondió ' + esc(minus(d.cargo)) + ', por ' + esc(minus(d.ciclo)) + '. Bajo cada dimensión se nombra la práctica que quedó más atrás.');
  if (conRadar) {
    h += '<div style="text-align:center;margin:6px 0 10px 0"><img src="cid:radar" width="340" height="268" alt="Perfil de las cinco dimensiones" style="display:inline-block;max-width:100%;height:auto;border:0"></div>';
  }
  let bandas = '';
  DIMS_ORDEN.forEach(function(k) {
    const b = d.bandas && d.bandas[k]; if (!b) return;
    const p = PILDORA[b.clase] || PILDORA['b-sin'];
    bandas += '<tr><td style="padding:9px 0;border-bottom:1px solid ' + LINEA + '">' +
        '<div style="font-size:14px;font-weight:bold;color:' + TINTA + '">' + esc(b.nombre) + '</div>' +
        (b.atras ? '<div style="font-size:12px;color:' + TINTA_MEDIA + ';margin-top:2px">Más atrás: ' + esc(minus(b.atras.practica)) + ' · ' + esc(b.atras.nivel) + '</div>' : '') +
      '</td><td valign="top" style="padding:9px 0 9px 10px;border-bottom:1px solid ' + LINEA + ';text-align:right;white-space:nowrap">' +
        '<span style="display:inline-block;font-size:11px;font-weight:bold;padding:2px 9px;border-radius:99px;background:' + p[0] + ';color:' + p[1] + ';border:1px ' + p[3] + ' ' + p[2] + '">' + esc(b.estado) + '</span>' +
      '</td></tr>';
  });
  h += '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + bandas + '</table>';
  h += parrafo('La etiqueta resume dónde quedaron las respuestas de esa dimensión, en una escala de cuatro niveles. <b style="color:' + TINTA + '">En niveles distintos</b> significa que dentro de la misma dimensión hay prácticas separadas por dos niveles o más.', ';font-size:12px;margin-top:10px');

  /* ---- sobre las respuestas ---- */
  if ((d.avisosDetalle || []).length) {
    h += titulo('Sobre las respuestas');
    d.avisosDetalle.forEach(function(x) {
      h += caja('<div style="font-size:14px;font-weight:bold;color:' + TINTA + ';line-height:1.3">' + esc(x.titulo) + '</div>' +
        '<div style="margin-top:7px">' + chips(x.apoyo) + '</div>' +
        '<div style="font-size:13px;color:' + TINTA_MEDIA + ';line-height:1.5;margin-top:4px">' + esc(x.texto) + '</div>');
    });
  }

  /* ---- lecturas cruzadas ---- */
  const L = d.lecturasDetalle || [];
  if (L.length) {
    h += titulo('Qué se lee al cruzar tus respuestas');
    h += parrafo('El gráfico muestra cada dimensión por separado. Lo que sigue aparece al mirar dos prácticas juntas. Cada lectura indica las preguntas en que se apoya.');
    L.forEach(function(x) {
      h += caja('<div style="font-size:15px;font-weight:bold;color:' + TINTA + ';line-height:1.3">' + esc(x.titulo) + '</div>' +
        '<div style="margin-top:7px">' + chips(x.apoyo) + '</div>' +
        '<div style="font-size:14px;color:' + TINTA + ';line-height:1.5;margin-top:4px">' + esc(x.lectura) + '</div>' +
        '<div style="font-size:13px;color:' + TINTA_MEDIA + ';line-height:1.5;margin-top:8px;padding-top:8px;border-top:1px solid ' + LINEA + '">' + esc(x.implicancia) + '</div>');
    });
  }

  /* ---- por dónde partir ---- */
  if (A.length) {
    h += titulo('Por dónde partir');
    h += parrafo('Este orden no sale de tus respuestas, sale de un criterio nuestro que declaramos acá para que lo puedas discutir. Primero las condiciones que hacen que un cambio sobreviva el año, después la práctica regular en la sala, después la capacidad que la sostiene, y al final la extensión al resto de la comunidad.');
    let a = '';
    A.forEach(function(x, i) {
      a += '<tr><td valign="top" style="padding:0 12px 18px 0;width:26px">' +
          '<div style="width:24px;height:24px;line-height:24px;border-radius:99px;background:#E25D5D;color:#fff;font-size:12px;font-weight:bold;text-align:center">' + (i + 1) + '</div></td>' +
        '<td valign="top" style="padding:0 0 18px 0">' +
          '<div style="font-size:15px;font-weight:bold;color:' + TINTA + ';line-height:1.3">' + esc(x.titulo) + '</div>' +
          '<div style="font-size:14px;color:' + TINTA_MEDIA + ';line-height:1.5;margin-top:3px">' + esc(x.detalle) + '</div>' +
          (x.adonde ? '<div style="font-size:13px;color:' + TINTA_MEDIA + ';line-height:1.5;margin-top:6px"><b style="color:' + TINTA + '">Adónde lleva.</b> ' + esc(x.adonde) + '</div>' : '') +
          (i === 0 && d.foco && d.foco.porque ? '<div style="font-size:13px;color:' + TINTA_MEDIA + ';line-height:1.5;margin-top:6px"><b style="color:' + TINTA + '">Por qué esta parte primero.</b> ' + esc(d.foco.porque) + '</div>' : '') +
          '<div style="font-size:11px;color:#9B9B9B;line-height:1.4;margin-top:6px">' + esc(x.origen) + '</div>' +
          (i === 0
            ? '<span style="display:inline-block;margin-top:6px;font-size:11px;font-weight:bold;color:' + VERDE_HONDO + ';background:#F3F9E4;border:1px solid ' + VERDE + ';padding:2px 9px;border-radius:99px">' + esc(x.ventana) + '</span>' +
              '<div style="font-size:12px;color:' + TINTA_MEDIA + ';margin-top:8px">Parte el ____________ · A cargo de ____________ · Se revisa el ____________</div>'
            : '<div style="font-size:12px;color:' + TINTA + ';margin-top:6px">' + esc(x.condicion) + '</div>' +
              '<div style="font-size:12px;color:' + TINTA_MEDIA + ';margin-top:3px">Cuando cuesta menos instalarla, ' + esc(minus(x.ventana)) + '.</div>') +
        '</td></tr>';
    });
    h += '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + a + '</table>';
    if (d.ventanaLejana) h += parrafo('La ventana de la primera acción queda a más de dos meses. Lo que sí se puede dejar hecho ahora es escribirla con responsable y fecha, para que entre al momento en que se arma el año siguiente.', ';font-size:12px;color:#9B9B9B');
    h += parrafo('Las tres se revisan en el mismo lugar, el punto de convivencia de la reunión del equipo directivo. La ventana indica cuándo cuesta menos instalarla. Las fechas las define el establecimiento.', ';font-size:12px;color:#9B9B9B');
  }

  /* ---- qué hacer con esto ---- */
  h += titulo('Qué hacer con esto');
  h += '<p style="margin:0 0 10px 0;font-size:14px;line-height:1.55;color:' + TINTA + '"><b>Mírenlo entre varios antes de partir.</b> Este informe lo respondió una persona y casi todo lo de arriba necesita que alguien más acepte mover algo. Veinte minutos de la reunión del equipo directivo que ya tienen, con quien dirige, quien lidera la UTP, quien coordina convivencia y alguien que esté en aula. Lo único que se decide es si están de acuerdo con lo que quedó marcado, cuál acción parte y quién queda con ella.</p>';
  h += '<div style="font-size:12px;color:' + TINTA_MEDIA + ';margin:0 0 14px 0">Acción que parte ____________ · A cargo de ____________ · Se revisa el ____________</div>';
  if (d.segunda) h += '<p style="margin:0 0 10px 0;font-size:14px;line-height:1.55;color:' + TINTA + '"><b>Pide una segunda respuesta.</b> ' + esc(d.segunda) + ' Son los mismos seis minutos, el enlace es el que ya tienes, y la diferencia entre las dos respuestas es material para esa misma conversación.</p>';
  h += '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px 0"><tr><td style="background:' + VERDE + ';border-radius:99px">' +
    '<a href="' + CONFIG.SITIO + '" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:bold;color:#1F2A08;text-decoration:none">Abrir el autodiagnóstico para el equipo</a>' +
    '</td></tr></table>';

  /* ---- lo instalado ---- */
  if ((d.instalado || []).length) {
    h += titulo('Lo que ya tienes instalado');
    h += parrafo('Lo que marcaste en los dos niveles más altos, y es la base sobre la que se apoyan las acciones de arriba: ' +
      esc(d.instalado.map(function(x) { return minus(x.titulo); }).join('; ')) + '.');
  }

  /* ---- plan de gestión ---- */
  if ((d.plan || []).length) {
    h += titulo('Dónde se conecta esto con el Plan de Gestión');
    h += parrafo('El Plan de Gestión de Convivencia Educativa debe contener siete contenidos mínimos, fijados en el artículo 16 D del decreto con fuerza de ley N° 2, de 2009, del Ministerio de Educación, reemplazado por el artículo 1 N° 9 de la Ley N° 21.809. La tabla indica qué preguntas de este cuestionario se refieren a cada uno, para que sepas dónde tienes material. Describe este cuestionario, no tu plan.');
    let p = '<tr><td style="padding:0 0 6px 0;border-bottom:1px solid ' + LINEA + ';font-size:11px;font-weight:bold;letter-spacing:.8px;text-transform:uppercase;color:#9B9B9B">Contenido mínimo del plan</td>' +
      '<td style="padding:0 0 6px 12px;border-bottom:1px solid ' + LINEA + ';font-size:11px;font-weight:bold;letter-spacing:.8px;text-transform:uppercase;color:#9B9B9B;text-align:right">Preguntas</td></tr>';
    d.plan.forEach(function(x) {
      p += '<tr><td valign="top" style="padding:8px 0;border-bottom:1px solid ' + LINEA + ';font-size:13px;color:' + TINTA + '">' + esc(x.letra) + ') ' + esc(x.contenido) + '</td>' +
        '<td valign="top" style="padding:8px 0 8px 12px;border-bottom:1px solid ' + LINEA + ';font-size:13px;font-weight:bold;text-align:right;white-space:nowrap;color:' + (x.preguntas ? VERDE_HONDO : '#E25D5D') + '">' +
        esc(x.preguntas || 'ninguna') + '</td></tr>';
    });
    h += '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + p + '</table>';
    h += '<div style="margin-top:14px">' + caja(
      '<div style="font-size:14px;font-weight:bold;color:' + TINTA + '">Qué no hace esta tabla</div>' +
      '<p style="margin:8px 0 0 0;font-size:13px;line-height:1.5;color:' + TINTA + '">No dice si tu plan cumple, ni si un contenido está cubierto. Son dieciséis preguntas y no recorren los siete contenidos. Quien verifica el cumplimiento es la Superintendencia de Educación.</p>' +
      '<p style="margin:8px 0 0 0;font-size:13px;line-height:1.5;color:' + TINTA + '">La ley rige desde el 1 de julio de 2026. En los establecimientos subvencionados o que reciben aportes del Estado, el artículo quinto transitorio da nueve meses desde esa fecha para implementar los artículos 16 D a 16 H, y el duodécimo transitorio sujeta a ese mismo plazo la elaboración del primer Plan de Gestión de Convivencia Educativa y la actualización del reglamento interno.</p>',
      '#FDEEEE', '#E25D5D') + '</div>';
  }

  /* ---- alcance ---- */
  h += titulo('Alcance de este informe');
  [ 'Describe prácticas declaradas por una persona, desde un cargo y un alcance determinados, en una fecha. No necesariamente describe el estado del establecimiento, y no verifica el cumplimiento de normativa educacional.',
    'El gráfico muestra cada dimensión por separado y no está hecho para compararlas entre sí, porque no están equiparadas en dificultad. Cada lectura se apoya solo en las respuestas que ella misma indica.',
    'Si decides tomar las acciones de más arriba, cada una necesita objetivos, lugar, fecha y encargado para entrar al plan.'
  ].forEach(function(t) {
    h += '<div style="font-size:13px;line-height:1.5;color:' + TINTA_MEDIA + ';padding-left:12px;border-left:2px solid ' + LINEA + ';margin-bottom:9px">' + t + '</div>';
  });

  /* ---- quién hizo ---- */
  h += titulo('Quién hizo este instrumento');
  h += '<p style="margin:0;font-size:14px;line-height:1.5;color:' + TINTA + '">Fundación Eventuras acompaña a colegios en formación docente y aprendizaje socioemocional. Representante y socio implementador de Second Step en Chile. Programas alineados al marco CASEL.</p>';
  h += '<p style="margin:8px 0 0 0;font-size:14px"><a href="https://www.eventuras.org" style="color:' + VERDE_HONDO + '">eventuras.org</a> · contacto@eventuras.org</p>';

  const lugar = [c.comuna, c.region, c.rbd ? 'RBD ' + c.rbd : null].filter(Boolean).join(' · ');
  const quien = [d.cargo, d.ciclo ? 'Alcance: ' + d.ciclo : null].filter(Boolean).join(' · ');

  return '' +
  '<div style="margin:0;padding:0;background:' + FONDO + ';font-family:Nunito,Segoe UI,Helvetica,Arial,sans-serif">' +
  '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + FONDO + ';padding:24px 12px">' +
  '<tr><td align="center">' +
  '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:14px;overflow:hidden;border:1px solid ' + LINEA + '">' +

  '<tr><td style="background:' + VERDE + ';padding:20px 24px">' +
    '<div style="font-size:11px;font-weight:bold;letter-spacing:1.4px;text-transform:uppercase;color:#1F2A08;opacity:.75">Autodiagnóstico de convivencia educativa</div>' +
    '<div style="font-size:21px;font-weight:bold;color:#1F2A08;margin-top:3px;line-height:1.2">' + esc(c.nombre || 'Tu establecimiento') + '</div>' +
    (lugar ? '<div style="font-size:13px;font-weight:bold;color:#1F2A08;opacity:.85;margin-top:5px">' + esc(lugar) + '</div>' : '') +
  '</td></tr>' +

  '<tr><td style="padding:24px">' +
    '<p style="margin:0 0 18px 0;font-size:15px;line-height:1.55;color:' + TINTA + '">Hola ' + esc((d.contacto.nombre || '').split(' ')[0]) +
      ', este es tu informe completo. Guarda este correo: es tu copia del autodiagnóstico.</p>' +
    h +
  '</td></tr>' +

  '<tr><td style="padding:16px 24px 22px 24px;border-top:1px solid ' + LINEA + '">' +
    '<p style="margin:0;font-size:11px;line-height:1.55;color:#9B9B9B">' +
      'Tus respuestas son confidenciales. No entregamos resultados individuales a tu sostenedor, al Ministerio ni a ninguna otra institución. ' +
      'Las guardamos por ' + CONFIG.RETENCION_MESES + ' meses y después quedan sin identificación del establecimiento. ' +
      'Para pedir que las borremos antes, responde este correo.' +
    '</p>' +
    '<p style="margin:10px 0 0 0;font-size:11px;color:#9B9B9B">Folio ' + esc(d.folio || '') + (quien ? ' · Respondido desde ' + esc(quien) : '') +
      ' · Corporación Educacional Eduventuras · contacto@eventuras.org</p>' +
  '</td></tr>' +

  '</table></td></tr></table></div>';
}

function textoPlano(d) {
  const c = d.colegio || {};
  let t = 'Autodiagnóstico de convivencia educativa\n' + (c.nombre || '') + '\n\n';
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
    cargo: 'Director o directora', ciclo: 'Solo enseñanza básica',
    bandas: {sala:{nombre:'Lo que pasa en la sala',estado:'En los primeros niveles'},
             adultos:{nombre:'Capacidad de los adultos',estado:'En instalación'},
             cultura:{nombre:'Cultura y espacios compartidos',estado:'En los primeros niveles'},
             liderazgo:{nombre:'Liderazgo y gestión',estado:'En instalación'},
             comunidad:{nombre:'Comunidad educativa',estado:'Avance desigual'}},
    foco: {id:'4.2', titulo:'Correspondencia entre prioridad declarada y recursos asignados',
           hoy:'Hay horas asignadas a una persona.', siguiente:'Existe tiempo protegido para el equipo.'},
    acciones: [{titulo:'Proteger el tiempo del equipo por escrito', detalle:'Dejar definido qué parte del consejo se destina a este trabajo.', ventana:'Antes de que parta el año'}],
    lecturas: ['Hay formación y la conversación posterior todavía no está instalada'],
    contacto: {nombre: 'Prueba', correo: Session.getEffectiveUser().getEmail(), tel: '', mkt: false},
    consentimiento: {informe: 'prueba'}
  });
}
