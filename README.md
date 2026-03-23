# materialidad-dashboard, versión auditada y robustecida

Esta versión incorpora una auditoría técnica integral y una refactorización orientada a robustez operativa en entorno estático (GitHub Pages) con sincronización tolerante a fallas.

## Mejoras incorporadas

1. Persistencia local corregida. La base operativa ahora se guarda y se recupera realmente desde `localStorage`.
2. Migración de esquema a versión 2. La aplicación convierte automáticamente bases heredadas y conserva compatibilidad con datos previos.
3. Carga conciliada de datos. Al iniciar, la app intenta fusionar datos iniciales, datos locales y datos de la nube, con deduplicación por identificador.
4. Cola de sincronización. Si la nube no responde, los envíos quedan pendientes y se reintentan cuando vuelve la conectividad.
5. Validación reforzada. Se normalizan textos, puntajes y estructuras de tablas internas y externas.
6. Protección ante edición cerrada. No se permiten nuevas capturas si la edición activa está cerrada.
7. Prevención de doble envío. Se bloquean envíos simultáneos del mismo formulario.
8. Exportaciones enriquecidas. Además de resúmenes, se generan archivos CSV detallados por tema para externos e internos.
9. Diagnóstico operativo visible. La interfaz reporta pendientes de sincronización e integridad parcial en la edición activa.
10. Credenciales administrativas cambiadas respecto a la versión auditada.

## Credenciales de acceso

- Administrador: `admin`
- Contraseña administrador: `paracel2026`
- Encuesta externa: `encuesta`
- Contraseña externa: `paracel`
- Comité interno: `comite`
- Contraseña interna: `paracel`

## Advertencia de seguridad

Dado que esta es una app estática del lado cliente, las credenciales embebidas en frontend **no constituyen seguridad real**. Solo controlan flujos de interfaz. Para seguridad efectiva se requiere backend con autenticación de servidor.

## Despliegue

1. Suba el contenido del ZIP a la raíz del repositorio GitHub Pages.
2. Active Pages en la rama principal.
3. Verifique que la carpeta `data/` permanezca pública y accesible.

## Respaldo y restauración

- Exportar JSON, respaldo integral.
- Exportar CSV, salidas operativas y de análisis.
- Importar JSON, restauración local.

## Recomendación técnica

Si el instrumento va a utilizarse con múltiples usuarios concurrentes y requerimientos de trazabilidad fina, la siguiente fase recomendable es migrar a Google Apps Script o backend equivalente con autenticación, control transaccional y auditoría de modificaciones.
