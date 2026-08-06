// Custom Cursor
const cursor = document.querySelector('.custom-cursor');
document.addEventListener('mousemove', (e) => {
    cursor.style.left = e.clientX + 'px';
    cursor.style.top = e.clientY + 'px';
});

const interactiveElements = document.querySelectorAll('a, button, .btn, .theme-toggle, .card');
interactiveElements.forEach(el => {
    el.addEventListener('mouseenter', () => cursor.classList.add('hovering'));
    el.addEventListener('mouseleave', () => cursor.classList.remove('hovering'));
});

// Particles.js configuration
const particlesConfig = {
    particles: {
        number: { value: 50, density: { enable: true, value_area: 800 } },
        color: { value: "#E94E64" },
        shape: { type: "circle" },
        opacity: { value: 0.5, random: false },
        size: { value: 3, random: true },
        line_linked: { enable: true, distance: 150, color: "#E94E64", opacity: 0.2, width: 1 },
        move: { enable: true, speed: 2, direction: "none", random: true, out_mode: "out" }
    },
    interactivity: {
        detect_on: "canvas",
        events: {
            onhover: { enable: true, mode: "grab" },
            onclick: { enable: true, mode: "push" },
            resize: true
        },
        modes: {
            grab: { distance: 140, line_linked: { opacity: 0.8 } },
            push: { particles_nb: 4 }
        }
    },
    retina_detect: true
};

particlesJS("particles-js", particlesConfig);

// Full-page typing (type-on-view) with exponential speed-up (base e)
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function autoMarkTypeOnView() {
    const main = document.querySelector('main');
    if (!main) return;

    // Mark basically all visible text elements (but avoid nav + non-text).
    const selector = [
        'h1', 'h2', 'h3',
        'p',
        'a.playlist-link',
        '.subtle-text'
    ].join(', ');

    main.querySelectorAll(selector).forEach((el) => {
        if (el.classList.contains('type-on-view')) return;
        if (el.closest('nav')) return;

        const text = (el.textContent || '').trim();
        if (!text) return;

        // Skip elements that are basically containers for images/icons
        if (el.querySelector('img, svg')) return;

        el.classList.add('type-on-view');
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const typingStates = new Map();

function resolveTypingSettings(el) {
    const defaults = {
        maxDelay: 70,
        minDelay: 10,
        accel: 3.5,
    };

    let current = el;
    while (current) {
        const maxDelay = current.dataset?.typeMaxDelay;
        const minDelay = current.dataset?.typeMinDelay;
        const accel = current.dataset?.typeAccel;

        if (maxDelay !== undefined || minDelay !== undefined || accel !== undefined) {
            return {
                maxDelay: parseFloat(maxDelay ?? defaults.maxDelay),
                minDelay: parseFloat(minDelay ?? defaults.minDelay),
                accel: parseFloat(accel ?? defaults.accel),
            };
        }

        current = current.parentElement;
    }

    return defaults;
}

async function typeNode(src, dest, state, totalChars) {
    if (src.nodeType === Node.TEXT_NODE) {
        const textNode = document.createTextNode('');
        dest.appendChild(textNode);

        for (const ch of src.nodeValue || '') {
            textNode.appendData(ch);

            state.typedChars += 1;
            const progress = totalChars > 0 ? state.typedChars / totalChars : 1;
            const baseDelay = state.minDelay + (state.maxDelay - state.minDelay) * Math.exp(-state.accel * progress);
            const delay = Math.max(0, baseDelay / Math.max(1, state.speedMultiplier));
            await sleep(delay);
        }

        return;
    }

    if (src.nodeType === Node.ELEMENT_NODE) {
        const copy = src.cloneNode(false);
        dest.appendChild(copy);

        for (const child of src.childNodes) {
            await typeNode(child, copy, state, totalChars);
        }
    }
}

async function typeElementHtml(el) {
    if (prefersReducedMotion) return;
    if (el.dataset.typed === '1') return;

    const state = typingStates.get(el) ?? { speedMultiplier: 1 };
    const typingSettings = resolveTypingSettings(el);
    state.typedChars = 0;
    state.maxDelay = typingSettings.maxDelay;
    state.minDelay = typingSettings.minDelay;
    state.accel = typingSettings.accel;
    typingStates.set(el, state);

    el.dataset.typed = '1';
    el.classList.add('typing');
    const clone = el.cloneNode(true);
    el.innerHTML = '';

    const totalChars = clone.textContent ? clone.textContent.length : 0;

    for (const child of clone.childNodes) {
        await typeNode(child, el, state, totalChars);
    }

    el.classList.remove('typing');
}

function initTypeOnView() {
    autoMarkTypeOnView();
    const els = Array.from(document.querySelectorAll('.type-on-view'));
    if (els.length === 0) return;
    if (prefersReducedMotion) {
        els.forEach(el => { el.dataset.typed = '1'; el.classList.remove('typing'); });
        return;
    }

    els.forEach(el => {
        el.dataset.typed = '0';
    });

    // Start typing immediately for anything already in view.
    const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            const el = entry.target;
            const ratio = Math.max(0, Math.min(1, entry.intersectionRatio || 0));

            // As the element becomes more visible, speed up exponentially (base e).
            // Multiplier range ~ [1, e^1.4] ≈ [1, 4.05]
            const speedMultiplier = Math.exp(1.01 * ratio);
            const state = typingStates.get(el) ?? { speedMultiplier: 1 };
            state.speedMultiplier = speedMultiplier;
            typingStates.set(el, state);

            if (entry.isIntersecting && el.dataset.typed !== '1') {
                typeElementHtml(el);
            }
        }
    }, {
        threshold: [0, 0.1, 0.2, 0.35, 0.5, 0.75, 1],
        rootMargin: '0px 0px -10% 0px'
    });

    els.forEach(el => observer.observe(el));
}

initTypeOnView();

// Theme Toggle
const themeToggle = document.getElementById('theme-toggle');
const body = document.body;

const themeMedia = window.matchMedia('(prefers-color-scheme: dark)');
const themeModes = ['auto', 'light', 'dark'];
let currentThemeMode = localStorage.getItem('themeMode') || 'auto';

function resolveIsDark(mode) {
    if (mode === 'dark') return true;
    if (mode === 'light') return false;
    return themeMedia.matches;
}

function updateParticlesForTheme(isDark) {
    if (!window.pJSDom || !window.pJSDom[0]) return;
    const pJS = window.pJSDom[0].pJS;
    pJS.particles.color.value = "#E94E64";
    pJS.particles.line_linked.color = "#E94E64";
    pJS.particles.line_linked.opacity = isDark ? 0.12 : 0.2;
    pJS.particles.opacity.value = isDark ? 0.45 : 0.5;
    pJS.fn.particlesRefresh();
}

function applyThemeMode(mode) {
    currentThemeMode = mode;
    localStorage.setItem('themeMode', mode);
    body.dataset.themeMode = mode;

    const isDark = resolveIsDark(mode);
    body.classList.toggle('dark-theme', isDark);
    body.classList.toggle('light-theme', !isDark);

    const label = `Theme mode: ${mode}`;
    themeToggle.setAttribute('aria-label', label);
    themeToggle.title = `Theme: ${mode}`;

    updateParticlesForTheme(isDark);
}

function cycleThemeMode() {
    const idx = themeModes.indexOf(currentThemeMode);
    const next = themeModes[(idx + 1) % themeModes.length];
    applyThemeMode(next);
}

themeToggle.addEventListener('click', cycleThemeMode);
themeMedia.addEventListener('change', () => {
    if (currentThemeMode === 'auto') applyThemeMode('auto');
});

applyThemeMode(currentThemeMode);

// GSAP Animations
gsap.registerPlugin(ScrollTrigger);

// Avatar travel: hero center -> navbar top-left
const profilePic = document.getElementById('profile-pic');
const navbar = document.getElementById('navbar');
const avatarTarget = document.getElementById('avatar-target');

let avatarState = 'hero';

function getHeroAvatarSize() {
    return window.matchMedia('(max-width: 768px)').matches ? 150 : 250;
}

function getHeroRect() {
    const size = getHeroAvatarSize();
    return {
        top: Math.round((window.innerHeight - size) / 2),
        left: Math.round((window.innerWidth - size) / 2),
        width: size,
        height: size,
    };
}

function getNavRect() {
    const rect = avatarTarget.getBoundingClientRect();
    return {
        top: Math.round(rect.top),
        left: Math.round(rect.left),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
    };
}

function showNavbarInstant() {
    const prevTransition = navbar.style.transition;
    navbar.style.transition = 'none';
    navbar.classList.add('visible');
    // force layout
    navbar.getBoundingClientRect();
    navbar.style.transition = prevTransition;
}

function hideNavbar() {
    navbar.classList.remove('visible');
}

function pinAvatar() {
    const heroRect = getHeroRect();
    gsap.set(profilePic, {
        position: 'fixed',
        top: heroRect.top,
        left: heroRect.left,
        width: heroRect.width,
        height: heroRect.height,
        margin: 0,
        zIndex: 1101,
        transformOrigin: '50% 50%',
    });
    profilePic.classList.remove('in-nav');
}

function animateAvatarToNav() {
    showNavbarInstant();
    const navRect = getNavRect();
    avatarState = 'nav';
    profilePic.classList.add('in-nav');
    gsap.to(profilePic, {
        top: navRect.top,
        left: navRect.left,
        width: navRect.width,
        height: navRect.height,
        borderWidth: 2,
        duration: 0.65,
        ease: 'power3.inOut',
    });
}

function animateAvatarToHero() {
    const heroRect = getHeroRect();
    avatarState = 'hero';
    profilePic.classList.remove('in-nav');
    gsap.to(profilePic, {
        top: heroRect.top,
        left: heroRect.left,
        width: heroRect.width,
        height: heroRect.height,
        borderWidth: 4,
        duration: 0.65,
        ease: 'power3.inOut',
        onComplete: hideNavbar,
    });
}

pinAvatar();

ScrollTrigger.create({
    trigger: ".hero-container",
    start: "bottom center",
    onEnter: () => {
        animateAvatarToNav();
    },
    onLeaveBack: () => {
        animateAvatarToHero();
    }
});

window.addEventListener('resize', () => {
    // keep the avatar snapped to the correct spot on resize
    if (avatarState === 'nav') {
        showNavbarInstant();
        const navRect = getNavRect();
        gsap.set(profilePic, {
            top: navRect.top,
            left: navRect.left,
            width: navRect.width,
            height: navRect.height,
        });
    } else {
        const heroRect = getHeroRect();
        gsap.set(profilePic, {
            top: heroRect.top,
            left: heroRect.left,
            width: heroRect.width,
            height: heroRect.height,
        });
    }
    ScrollTrigger.refresh();
});

// Section animations
gsap.utils.toArray('.section').forEach(section => {
    gsap.from(section, {
        scrollTrigger: {
            trigger: section,
            start: "top 80%",
        },
        y: 50,
        opacity: 0,
        duration: 1,
        ease: "power3.out"
    });
});

gsap.utils.toArray('.card').forEach((card, i) => {
    gsap.from(card, {
        scrollTrigger: {
            trigger: card,
            start: "top 90%",
        },
        y: 30,
        opacity: 0,
        duration: 0.8,
        delay: i * 0.1,
        ease: "power2.out"
    });
});