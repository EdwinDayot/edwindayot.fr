(() => {
  const anchors = [
    "top",
    "contenu",
    "projets",
    "plant-calendar",
    "fate",
    "shorts",
    "cove",
    "parcours",
    "hero-title",
    "work-title",
    "about-title",
    "contact-title",
  ];
  function redirect() {
    if (anchors.includes(location.hash.slice(1)))
      location.replace("/portfolio/" + location.hash);
  }
  redirect();
  addEventListener("hashchange", redirect);
})();
