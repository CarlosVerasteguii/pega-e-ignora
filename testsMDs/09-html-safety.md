# HTML & Safety (sanitización)

Inline HTML: <kbd>Ctrl</kbd> + <kbd>V</kbd>

Bloque HTML (seguro):

<details>
  <summary>Click para expandir</summary>
  <p>Contenido dentro de <code>&lt;details&gt;</code>.</p>
</details>

Intentos de link peligroso (NO debería quedar clickeable como `javascript:`):

[link javascript](javascript:alert('xss'))

<a href="javascript:alert('xss')">html javascript link</a>

Si estos links llegan a ejecutar algo, hay un bug serio de sanitización.
