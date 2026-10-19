// Viser enhver uventet fejl synligt øverst på siden (i stedet for en stille, tom side).
(function () {
  function vis(tekst) {
    var boks = document.getElementById('fejlboks');
    if (!boks) { document.addEventListener('DOMContentLoaded', function () { vis(tekst); }); return; }
    var linje = document.createElement('div');
    linje.textContent = '⚠ ' + tekst;
    boks.appendChild(linje);
    boks.hidden = false;
  }
  window.tactivarFejl = vis;
  window.addEventListener('error', function (e) {
    vis('Fejl: ' + e.message + (e.filename ? ' (' + e.filename.split('/').pop() + ':' + e.lineno + ')' : ''));
  });
  window.addEventListener('unhandledrejection', function (e) {
    vis('Fejl: ' + (e.reason && e.reason.message ? e.reason.message : String(e.reason)));
  });
})();
