# Autodiagnóstico de convivencia educativa

Herramienta de Fundación Eventuras para que un establecimiento revise, en dieciséis
preguntas, las prácticas que sostienen la convivencia educativa y reciba un informe con
su perfil y tres acciones para el año escolar.

Sitio: https://diagnostico.eventuras.org · Informe de ejemplo: https://diagnostico.eventuras.org/#ejemplo

## Qué hay en este repositorio

| Carpeta | Qué contiene |
|---|---|
| `web/` | La página publicada: cuestionario, cálculo, gráfico e informe (`index.html`), directorio de establecimientos, logo y dominio. |
| `apps-script/` | El código que corre en Google Apps Script: guarda cada respuesta en una planilla y envía el informe por correo. |

## Publicación

La página se sirve con GitHub Pages desde la rama `gh-pages`, que contiene solo la carpeta
`web/`. Se actualiza agregando un commit con el contenido actual de `web/` encima de esa rama:

    git fetch origin
    git push origin "$(git commit-tree main:web -p origin/gh-pages -m 'Actualiza la página')":refs/heads/gh-pages

El código de `apps-script/` se pega en el proyecto de Apps Script y se publica como una
versión nueva de la implementación. El identificador de la planilla no se guarda en este
repositorio.

## Datos personales

Las respuestas se guardan doce meses con identificación del establecimiento y después se
anonimizan con un activador mensual. Política de privacidad:
https://sites.google.com/eventuras.org/fundacioneventuras/sobre-eventuras/pol%C3%ADtica-de-privacidad
