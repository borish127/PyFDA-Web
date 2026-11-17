try {
  var t = localStorage.getItem('pyfda-theme');
  if (t === 'light' || t === 'dark') {
    var meta = document.querySelector('meta[name="color-scheme"]');
    if (meta) meta.content = t;
    document.documentElement.setAttribute('data-theme', t);
  }
} catch (e) {}
