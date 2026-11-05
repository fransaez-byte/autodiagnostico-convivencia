# Autodiagnóstico de convivencia

Mismo sistema de diseño, mismo stack y mismo flujo de despliegue que el cotizador.

| Pieza | Estado |
|---|---|
| Interfaz completa, 16 ítems más 3 opcionales | lista |
| Informe con radar, lecturas cruzadas, ruta priorizada y sección de Plan de Gestión | listo |
| Buscador de establecimientos, 12.009 colegios | listo, reusa el archivo del cotizador |
| Guardado como PDF desde el navegador | listo |
| Aviso de confidencialidad y captura de contacto | listos |
| Backend en Apps Script | **escrito, falta instalarlo** |
| Dato propio del establecimiento en el informe | **pendiente, esperando a la Agencia** |

Sin el backend la herramienta funciona completa: la persona responde, ve su informe y lo
guarda. Lo que no ocurre es el correo ni la fila en la planilla.

---

## Para ver un informe de ejemplo

Abre la página con `#ejemplo` al final de la dirección. Carga un colegio real del
directorio con respuestas inventadas y salta directo al informe, con el aviso de que es un
ejemplo. Sirve en local y una vez publicado.

    web/index.html#ejemplo
    https://diagnostico.eventuras.org/#ejemplo

---

## Paso 1 · Publicarlo en Netlify

Netlify, proyecto nuevo, pestaña **Deploys**, y arrastrar la carpeta `web`. Solo esa. No
uses `app.netlify.com/drop`, porque eso crea un sitio nuevo con otra dirección cada vez.

Conviene un subdominio propio, `diagnostico.eventuras.org`, para no mezclarlo con el
cotizador. Se configura en Netlify, **Domain management**, igual que el otro.

| Archivo | Qué hace |
|---|---|
| `web/index.html` | Todo: instrumento, cálculo, radar e informe |
| `web/establecimientos.json` | Directorio Mineduc 2026, copiado del cotizador |
| `web/logo.png` | Logo a color para la cabecera |
| `web/netlify.toml` | Caché y encabezados de seguridad |
| `apps-script/Codigo.gs` | El backend. **No se sube a Netlify**, se pega en Apps Script |
| `README.md` | Esto. Tampoco se sube |

Con esto la herramienta ya funciona y se puede probar de punta a punta, salvo el correo.

---

## Paso 2 · El backend en Google

Todo esto va en la cuenta **contacto@eventuras.org**, no en la personal. Si entras con otra
cuenta no vas a ver el proyecto y Google va a dar errores de permisos confusos. La forma
segura es una ventana de incógnito con sesión iniciada solo en esa cuenta.

**1. La planilla.** Crea una hoja de cálculo nueva, llámala `Autodiagnóstico de
convivencia`. El ID es el trozo largo de la dirección, entre `/d/` y `/edit`. Cópialo.

**2. El proyecto.** Entra a [script.google.com](https://script.google.com), proyecto nuevo,
llámalo `Autodiagnóstico`. Borra lo que viene y pega el contenido completo de
`apps-script/Codigo.gs`.

**3. La configuración.** Arriba del archivo está el bloque `CONFIG`. Pega el ID de la
planilla en `PLANILLA` y revisa las otras cuatro líneas. `SITIO` tiene que quedar con la
dirección real una vez que Netlify esté publicado.

**4. La prueba del correo.** Antes de publicar nada, elige la función `prueba` en el
selector de arriba y dale a ejecutar. Google va a pedir permisos la primera vez, acéptalos.
Te debería llegar un correo de ejemplo a contacto@eventuras.org. Si llega bien, sigue.

**5. La implementación.** Implementar → Nueva implementación → tipo **Aplicación web**.
Ejecutar como: **yo**. Quién tiene acceso: **cualquier persona**. Esa segunda opción es
obligatoria, porque quien responde el formulario no tiene sesión de Google. Copia la URL
que termina en `/exec`.

**6. Conectar las dos puntas.** Abre `web/index.html`, busca la línea `const ENDPOINT = ''`
y pega ahí la URL entre las comillas. Vuelve a arrastrar la carpeta `web` a Netlify.

**Cada vez que cambies `Codigo.gs`** hay que hacer Implementar → Gestionar implementaciones
→ editar el lápiz → versión nueva. Si no, los cambios no salen al aire y es el error más
común.

**7. El activador de limpieza.** En el panel izquierdo, Activadores → añadir activador.
Función `limpiar`, origen por tiempo, mensual. Borra el nombre, el correo, el teléfono y el
RBD de las respuestas que pasaron los doce meses de retención, y deja el resto para el
análisis agregado. Es lo que permite prometer en el correo que los datos no se guardan para
siempre.

El correo sale desde contacto@eventuras.org. El límite de Workspace es 1.500 diarios, muy
por encima de lo que va a usar esto.

---

## Qué queda registrado en cada respuesta

Una fila en la planilla, con el establecimiento y su RBD, el cargo y el ciclo desde donde
se respondió, el contacto, el estado de las cinco dimensiones, el foco, las tres acciones,
las lecturas que se dispararon, las dieciséis respuestas una por una, las tres opcionales,
y el texto del consentimiento que la persona aceptó.

**No se guarda ningún PDF, y es a propósito.** El informe se arma en el correo y en la
página. Mientras menos quede almacenado, menos hay que entregar si alguna vez llega un
requerimiento de la Superintendencia, y menos riesgo de exponer a un colegio que respondió
con honestidad. El ítem 3.2 es el que hace que esto importe.

Para Mariana, las columnas que sirven son el estado de las cinco dimensiones y el foco. Un
correo que dice lo que ese colegio marcó como más atrás es el mejor correo que va a mandar.

---

## Los tres interruptores del `web/index.html`

Están todos arriba del `<script>`, con nombre y comentario.

**`ENDPOINT`** · la URL del Apps Script. Mientras esté vacío, el informe se muestra igual y
no se envía nada.

**`PATRONES_ACTIVOS`** · en `false`. Los patrones solo se pueden nombrar cuando haya
respuestas suficientes para definir qué es alto y qué es bajo contra la distribución
observada. Antes de eso, el informe entrega el perfil, las lecturas cruzadas, el foco y las
tres acciones, que ya valen por sí solos.

**El dato propio del establecimiento** · el informe tiene el lugar reservado y hoy muestra
solo la identificación del colegio. El IDPS entra cuando responda la Agencia.

---

## Cómo concluye el informe, y por qué así

El riesgo de un instrumento como este es afirmar más de lo que el dato aguanta. Un director
que discrepa de una conclusión casi siempre discrepa porque la conclusión no mostró en qué
se apoyaba. La protección está en tres reglas, escritas en el código y declaradas en el
propio informe.

**Toda lectura se apoya en respuestas específicas, que van nombradas.** Viven en la función
`lecturas()`. Cada una se dispara solo si se cumplen sus condiciones exactas, muestra en
pantalla las preguntas en que se apoya y dice qué implicancia tiene. Si no se cumple
ninguna, el informe lo dice en vez de completar. Para agregar una lectura nueva hay que
poder nombrar las dos respuestas que la sostienen.

**El orden de la ruta es un criterio declarado, no una lectura del colegio.** Vive en
`TRAMOS` y va de las condiciones que hacen que un cambio sobreviva el año, a la práctica
regular en la sala, a la capacidad que la sostiene, y al final a la extensión al resto de la
comunidad. El informe enuncia ese orden y explica por qué el tramo elegido va primero. Así
el colegio recibe un criterio que puede aceptar o rechazar.

**El foco muestra el paso siguiente, no el nivel máximo.** Un establecimiento en el primer
nivel no necesita ver el cuarto, necesita ver el segundo.

---

## Decisiones incorporadas que conviene no deshacer sin pensarlo

- **Los cuatro niveles no se nombran mientras la persona responde.** Elige entre cuatro
  descripciones, en orden. Los instrumentos de referencia describen estados y no calidades,
  y una palabra evaluativa tira las respuestas hacia arriba. Los nombres aparecen solo en la
  lista de respuestas del final, y son Sin instalar, Inicial, En práctica y Consolidado.
- **El orden de las alternativas no se altera.** Desordenarlas obliga a releer las cuatro
  para ubicarse, sube el error de medición y alarga el tiempo. Lo que introducía sesgo eran
  las etiquetas, no el orden.
- **La marca de ciclo no reemplaza la respuesta.** Se elige un ciclo al entrar y se contesta
  siempre por ese ciclo. Si una práctica funciona distinto en otros, se marca en una casilla
  aparte y el dato se conserva completo. Tres o más marcas generan un aviso propio.
- **No hay puntaje global ni nombres de nivel a escala de dimensión.** Las dimensiones no
  están equiparadas en dificultad, así que compararlas produce hallazgos que son artefactos
  del instrumento. Se entregan estados: prácticas aisladas, en instalación, prácticas
  instaladas.
- **Regla de dispersión.** Si los ítems de una dimensión abarcan tres o más niveles, no se
  devuelve estado, se devuelve avance desigual. Es más honesto y suele ser un hallazgo más
  interesante.
- **"No lo sé" y la marca de ciclo no castigan.** Tres o más de cualquiera genera un aviso
  propio en el informe. Son hallazgos, no datos perdidos.
- **Ningún programa de Eventuras aparece en el cuerpo del informe.** Las tres acciones están
  escritas como prácticas. La página de Eventuras va separada y es declarativa.
- **El aviso de confidencialidad aparece dos veces**, en la portada y junto al correo, y
  dice cuatro cosas concretas: a dónde llega el informe, que no se entregan resultados
  individuales a terceros, que cualquier panorama agregado va sin identificar
  establecimientos, y que pueden pedir que borremos los datos.

---

## Lo que falta decidir antes de mandarle el enlace a un colegio

1. Respuesta de la Agencia sobre uso de las bases por RBD, o se publica sin el IDPS.
2. Si un sostenedor distribuye el enlace a sus colegios, qué ve. La recomendación es que vea
   solo un agregado con mínimo de casos, nunca resultados individuales, y que eso quede
   declarado en el formulario desde el primer día.
3. La URL real de la política de privacidad, que hoy apunta a
   `eventuras.org/politica-de-privacidad`. Tiene que existir antes de publicar, y declarar
   el responsable, la finalidad, el plazo de doce meses y cómo pedir la eliminación.
4. Confirmar que el responsable del tratamiento se llame **Corporación Educacional
   Eduventuras** en la escritura, que es el nombre que aparece en el formulario y en el pie
   del correo.

---

## Artículo 16 D: verificado

Las siete letras del artículo 16 D están contrastadas con el texto oficial: Diario Oficial
N° 44.415, del 1 de abril de 2026, artículo 1 N° 9 de la Ley 21.809. Se corrigieron tres
rótulos en `MAPA_16D` para que calcen con la ley:

- **a)** incluye también la coordinación con el área administrativa, no solo la
  técnico-pedagógica.
- **d)** son conflictos de convivencia o situaciones de riesgo en general, no solo entre
  estudiantes.
- **e)** es la calendarización de las actividades del año escolar, y cada actividad debe
  indicar objetivo, contribución al propósito del plan, lugar, fecha y persona encargada.

Las preguntas asociadas cubren solo una parte de algunas letras: 4.3 cubre la coordinación
pedagógica de la letra a) y no la administrativa; 5.3 cubre los conflictos entre
estudiantes de la letra d); 2.4 cubre el bienestar del equipo adulto de la letra c).

El plazo del 1 de abril de 2027 está confirmado: la ley se publicó el 1 de abril de 2026,
entra en vigencia a los tres meses (artículo primero transitorio) y los establecimientos
subvencionados tienen nueve meses desde ahí (artículo quinto transitorio).
