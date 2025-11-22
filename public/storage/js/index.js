const sidebar = document.querySelector(".sidebar");
    const sidebarToggler = document.querySelector(".sidebar-toggler");
    const menuToggler = document.querySelector(".menu-toggler");
    const mainContent = document.querySelector(".main-content");
    const navLinks = document.querySelectorAll(".sidebar-nav .nav-link");
    const mainFrame = document.getElementById("mainFrame");
    const widgetButton = document.querySelector(".widget-button");
    const widgetPopup = document.querySelector(".widget-popup");
    const widgetOptions = document.querySelectorAll(".widget-option");

    if (location.pathname.endsWith("index.html") && location.hash === "#blank" || location.href.endsWith("#blank")) {
      const win = window.open();
      const iframe = win.document.createElement("iframe");
      iframe.src = location.origin + location.pathname.replace("index.html","") + "/";
      iframe.style = "border:none; width:100%; height:100vh; position:fixed; top:0; left:0;";
      iframe.allow = "fullscreen";
      iframe.referrerpolicy = "no-referrer";
      win.document.body.style.margin = "0";
      win.document.body.appendChild(iframe);
      window.location = "about:blank";
    }

    sidebar.classList.add("collapsed");
    mainContent.classList.remove("sidebar-expanded");

    sidebarToggler.addEventListener("click", () => {
      sidebar.classList.toggle("collapsed");
      mainContent.classList.toggle("sidebar-expanded");
    });

    const collapsedSidebarHeight = "56px";
    const fullSidebarHeight = "calc(100vh - 32px)";

    const toggleMenu = (isMenuActive) => {
      sidebar.style.height = isMenuActive ? `${sidebar.scrollHeight}px` : collapsedSidebarHeight;
      menuToggler.querySelector("span").innerText = isMenuActive ? "close" : "menu";
    };

    menuToggler.addEventListener("click", () => {
      toggleMenu(sidebar.classList.toggle("menu-active"));
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth >= 1024) {
        sidebar.style.height = fullSidebarHeight;
      } else {
        sidebar.classList.remove("collapsed");
        sidebar.style.height = "auto";
        toggleMenu(sidebar.classList.contains("menu-active"));
      }
    });

    class TxtType {
      constructor(el, toRotate, period) {
        this.toRotate = toRotate;
        this.el = el;
        this.loopNum = 0;
        this.period = Number.parseInt(period, 10) || 2000;
        this.txt = "";
        this.tick();
        this.isDeleting = false;
      }
      tick() {
        const i = this.loopNum % this.toRotate.length;
        const fullTxt = this.toRotate[i];
        if (this.isDeleting) {
          this.txt = fullTxt.substring(0, this.txt.length - 1);
        } else {
          this.txt = fullTxt.substring(0, this.txt.length + 1);
        }
        this.el.innerHTML = '<span class="wrap">' + this.txt + "</span>";
        let delta = 200 - Math.random() * 100;
        if (this.isDeleting) { delta /= 2; }
        if (!this.isDeleting && this.txt === fullTxt) {
          delta = this.period;
          this.isDeleting = true;
        } else if (this.isDeleting && this.txt === "") {
          this.isDeleting = false;
          this.loopNum++;
          delta = 500;
        }
        setTimeout(() => this.tick(), delta);
      }
    }

    document.addEventListener("DOMContentLoaded", () => {
      const elements = document.getElementsByClassName("typewrite");
      for (let i = 0; i < elements.length; i++) {
        const toRotate = elements[i].getAttribute("data-type");
        const period = elements[i].getAttribute("data-period");
        if (toRotate) {
          new TxtType(elements[i], JSON.parse(toRotate), period);
        }
      }
      const css = document.createElement("style");
      css.innerHTML = ".typewrite > .wrap { border-right: 0.06em solid #a04cff}";
      document.body.appendChild(css);

      if (navLinks.length > 0) navLinks[0].classList.add("active");
    });

    navLinks.forEach((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        const src = link.getAttribute("data-src");
        if (src) mainFrame.src = src;
        navLinks.forEach((navLink) => navLink.classList.remove("active"));
        link.classList.add("active");
      });
    });

    widgetButton.addEventListener("click", () => {
      widgetPopup.classList.toggle("show");
    });

    widgetOptions.forEach((option) => {
      option.addEventListener("click", () => {
        const src = option.getAttribute("data-src");
        if (src) mainFrame.src = src;
        widgetPopup.classList.remove("show");
      });
    });

    document.addEventListener("click", (event) => {
      if (!widgetButton.contains(event.target) && !widgetPopup.contains(event.target)) {
        widgetPopup.classList.remove("show");
      }
    });

    window.addEventListener("message", (event) => {
      if (event.origin !== window.location.origin) return;
      if (event.data.type === "login_success" || event.data.type === "signup_success") {
        mainFrame.src = "pages/settings/p2.html";
      }
      if (event.data.type === "logout") {
        mainFrame.src = "pages/settings/p.html";
      }
    });