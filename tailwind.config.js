/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [{ raw: require('fs').readFileSync('./index.html', 'utf8'), extension: 'html' }],
  theme: { extend: {} },
  plugins: [],
}
