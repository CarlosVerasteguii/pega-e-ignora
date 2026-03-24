# testsJSONs (fixtures)

Esta carpeta contiene fixtures JSON para probar el viewer en modo JSON con casos normales, edge cases y errores deliberados.

## Objetivos

- Validar apertura, edicion, pretty, minify y guardado.
- Ejercitar arbol JSON, seleccion, scroll y persistencia de sesion.
- Probar unicode, numeros raros, claves extranas y estructuras profundas.
- Forzar estados invalidos sin tener que improvisar durante la prueba.

## Fixtures incluidos

- `01-basico-objeto.json`
  - Objeto simple y saludable para smoke inicial.
- `02-arreglo-mixto.json`
  - Array con objetos, booleanos, null y valores mixtos.
- `03-anidacion-profunda.json`
  - Objeto muy anidado para probar arbol y seleccion.
- `04-unicode-y-escapes.json`
  - Emojis, acentos, saltos de linea y escapes.
- `05-numeros-extremos.json`
  - Enteros, floats, cientifica y precision alta.
- `06-vacios-y-nulos.json`
  - Valores vacios, null, arrays vacios y objetos vacios.
- `07-config-realista.json`
  - Configuracion tipo app real, buena para settings-like data.
- `08-claves-raras.json`
  - Claves con espacios, slashes, puntos, unicode y cadena vacia.
- `09-dataset-largo.json`
  - Dataset mediano con muchos registros.
- `10-claves-duplicadas.json`
  - JSON valido con claves duplicadas para observar comportamiento.
- `11-json-invalido-coma-final.json`
  - Intencionalmente invalido por coma final.
- `12-json-invalido-cadena-sin-cerrar.json`
  - Intencionalmente invalido por string sin cerrar.
- `13-top-level-string.json`
  - JSON valido con primitive en raiz.
- `14-top-level-null.json`
  - JSON valido con `null` en raiz.

## Uso recomendado

1. Primero abrir `01-basico-objeto.json`.
2. Luego `03-anidacion-profunda.json` y `09-dataset-largo.json`.
3. Despues `10-claves-duplicadas.json`, `13-top-level-string.json` y `14-top-level-null.json`.
4. Al final abrir `11-json-invalido-coma-final.json` y `12-json-invalido-cadena-sin-cerrar.json`.

## Nota

Los archivos `11` y `12` son deliberadamente invalidos. Sirven para probar que la app no crashea, bloquea guardado si corresponde y deja editar para recuperacion manual.
