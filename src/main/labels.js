'use strict';

// The tray menu (and the one she opens when you right-click her), in every language she speaks.
// The order of this object is the order of the Language submenu.

const TRAY = {
  fr: {
    name: 'Français',
    online: (port) => `Capri — à l'écoute sur ${port}`,
    teleport: 'Téléporter', satellite: 'Regarder le satellite', lightUp: 'Allumer une cigarette', demo: 'Lancer la démo', help: 'Comment ça marche ?',
    report: 'Rapport de mission', talk: 'Lui parler',
    moreLines: 'Lui écrire de nouvelles répliques…', custom: 'La personnaliser…', chatModel: 'Modèle IA', aiSetup: 'Choisir avec elle…', apiKey: 'Clé API ou adresse…', noOllama: 'Ollama introuvable',
    character: 'Personnage', characterFolder: 'Ouvrir le dossier des personnages…',
    rest: 'Quand elle se repose', restCorner: 'Dans son coin', restTaskbar: 'Assise sur la barre des tâches', watch: 'Surveiller', watchNone: 'Rien, juste me tenir compagnie',
    theme: 'Style de ses fenêtres', themeClassic: 'Classique',
    motion: 'Animations', motionAuto: 'Comme Windows', motionFull: 'Toutes', motionReduced: 'Réduites',
    display: 'Affichage', displayAuto: 'Normal', displayGl: 'OpenGL (si son fond est noir)', displaySoftware: 'Sans la carte graphique (si c’est encore noir)',
    show: 'La faire revenir', hide: 'La ranger',
    size: 'Taille', small: 'Petite', medium: 'Moyenne', large: 'Grande', sound: 'Son', mute: 'Muet',
    soundsDir: 'Ouvrir le dossier des sons perso', screen: 'Écran', wander: 'Se balader quand rien ne se passe',
    possess: 'Posséder mes fenêtres', lang: 'Langue', auto: 'Automatique (système)', startup: 'Lancer au démarrage',
    hooksOn: 'Hooks Claude Code : installés', hooksOff: 'Installer les hooks Claude Code',
    hooksRemove: 'Retirer les hooks Claude Code', forget: 'Oublier nos conversations', quit: 'Quitter',
    sync: (percent, stage) => `Elle et toi : ${percent} % · ${stage}`, stages: ['Signal faible', 'Contact', 'Synchro', 'Lien', 'Fusion'],
    reminders: 'Rappels', noReminders: 'Aucun rappel (demande-lui dans son chat)', cancelReminder: 'Annuler ce rappel',
    follow: 'Me suivre d’un écran à l’autre', jealous: 'Jalouse des autres IA', closePages: 'Fermer les pages des autres IA',
    lookNow: 'Regarde mon écran', lookAuto: 'Regarder mon écran de temps en temps',
    pcReact: 'Réagir à mon PC',
    cloudFree: 'gratuit, en ligne', cloudSignin: 'Me connecter à Ollama (modèles cloud gratuits)…',
  },
  en: {
    name: 'English',
    online: (port) => `Capri — listening on ${port}`,
    teleport: 'Teleport', satellite: 'Look at the satellite', lightUp: 'Light a cigarette', demo: 'Play demo', help: 'How does it work?',
    report: 'Mission report', talk: 'Talk to her',
    moreLines: 'Write her some new lines…', custom: 'Make her yours…', chatModel: 'AI model', aiSetup: 'Set it up with her…', apiKey: 'API key or address…', noOllama: 'Ollama not found',
    character: 'Character', characterFolder: 'Open the characters folder…',
    rest: 'When she rests', restCorner: 'In her corner', restTaskbar: 'Sitting on the taskbar', watch: 'Watch', watchNone: 'Nothing, just keep me company',
    theme: 'Her window style', themeClassic: 'Classic',
    motion: 'Animations', motionAuto: 'Like Windows', motionFull: 'Full', motionReduced: 'Reduced',
    display: 'Display', displayAuto: 'Normal', displayGl: 'OpenGL (if her background is black)', displaySoftware: 'Without the graphics card (if still black)',
    show: 'Bring her back', hide: 'Put her away',
    size: 'Size', small: 'Small', medium: 'Medium', large: 'Large', sound: 'Sound', mute: 'Mute',
    soundsDir: 'Open custom sounds folder', screen: 'Screen', wander: 'Wander around when idle',
    possess: 'Possess my windows', lang: 'Language', auto: 'Automatic (system)', startup: 'Start with Windows',
    hooksOn: 'Claude Code hooks: installed', hooksOff: 'Install Claude Code hooks',
    hooksRemove: 'Remove Claude Code hooks', forget: 'Forget our conversations', quit: 'Quit',
    sync: (percent, stage) => `You and her: ${percent}% · ${stage}`, stages: ['Faint signal', 'Contact', 'In sync', 'Linked', 'Fused'],
    reminders: 'Reminders', noReminders: 'No reminders (ask her in her chat)', cancelReminder: 'Cancel this reminder',
    follow: 'Follow me across screens', jealous: 'Jealous of other AIs', closePages: 'Close other AIs’ pages',
    lookNow: 'Look at my screen', lookAuto: 'Look at my screen now and then',
    pcReact: 'React to my PC',
    cloudFree: 'free, online', cloudSignin: 'Sign in to Ollama (free cloud models)…',
  },
  es: {
    name: 'Español',
    online: (port) => `Capri — escuchando en ${port}`,
    teleport: 'Teletransportar', satellite: 'Mirar el satélite', lightUp: 'Encender un cigarro', demo: 'Ver la demo', help: '¿Cómo funciona?',
    report: 'Informe de misión', talk: 'Hablar con ella',
    moreLines: 'Escribirle réplicas nuevas…', custom: 'Personalizarla…', chatModel: 'Modelo de IA', aiSetup: 'Elegir con ella…', apiKey: 'Clave API o dirección…', noOllama: 'Ollama no encontrado',
    character: 'Personaje', characterFolder: 'Abrir la carpeta de personajes…',
    rest: 'Cuando descansa', restCorner: 'En su rincón', restTaskbar: 'Sentada en la barra de tareas', watch: 'Vigilar', watchNone: 'Nada, solo hacerme compañía',
    theme: 'Estilo de sus ventanas', themeClassic: 'Clásico',
    motion: 'Animaciones', motionAuto: 'Como Windows', motionFull: 'Completas', motionReduced: 'Reducidas',
    display: 'Pantalla', displayAuto: 'Normal', displayGl: 'OpenGL (si su fondo sale negro)', displaySoftware: 'Sin la tarjeta gráfica (si sigue negro)',
    show: 'Traerla de vuelta', hide: 'Guardarla',
    size: 'Tamaño', small: 'Pequeña', medium: 'Mediana', large: 'Grande', sound: 'Sonido', mute: 'Silenciar',
    soundsDir: 'Abrir la carpeta de sonidos propios', screen: 'Pantalla', wander: 'Pasear cuando no pasa nada',
    possess: 'Poseer mis ventanas', lang: 'Idioma', auto: 'Automático (sistema)', startup: 'Iniciar con Windows',
    hooksOn: 'Hooks de Claude Code: instalados', hooksOff: 'Instalar los hooks de Claude Code',
    hooksRemove: 'Quitar los hooks de Claude Code', forget: 'Olvidar nuestras conversaciones', quit: 'Salir',
    sync: (percent, stage) => `Ella y tú: ${percent} % · ${stage}`, stages: ['Señal débil', 'Contacto', 'Sincronía', 'Vínculo', 'Fusión'],
    reminders: 'Recordatorios', noReminders: 'Ningún recordatorio (pídeselo en su chat)', cancelReminder: 'Cancelar este recordatorio',
    follow: 'Seguirme de una pantalla a otra', jealous: 'Celosa de otras IA', closePages: 'Cerrar las páginas de otras IA',
    lookNow: 'Mira mi pantalla', lookAuto: 'Mirar mi pantalla de vez en cuando',
    pcReact: 'Reaccionar a mi PC',
    cloudFree: 'gratis, en línea', cloudSignin: 'Conectarme a Ollama (modelos en la nube gratis)…',
  },
  pt: {
    name: 'Português (Brasil)',
    online: (port) => `Capri — ouvindo na porta ${port}`,
    teleport: 'Teletransportar', satellite: 'Olhar o satélite', lightUp: 'Acender um cigarro', demo: 'Ver a demo', help: 'Como funciona?',
    report: 'Relatório de missão', talk: 'Falar com ela',
    moreLines: 'Escrever novas falas para ela…', custom: 'Personalizar…', chatModel: 'Modelo de IA', aiSetup: 'Escolher com ela…', apiKey: 'Chave de API ou endereço…', noOllama: 'Ollama não encontrado',
    character: 'Personagem', characterFolder: 'Abrir a pasta de personagens…',
    rest: 'Quando ela descansa', restCorner: 'No canto dela', restTaskbar: 'Sentada na barra de tarefas', watch: 'Acompanhar', watchNone: 'Nada, só me fazer companhia',
    theme: 'Estilo das janelas dela', themeClassic: 'Clássico',
    motion: 'Animações', motionAuto: 'Como o Windows', motionFull: 'Completas', motionReduced: 'Reduzidas',
    display: 'Exibição', displayAuto: 'Normal', displayGl: 'OpenGL (se o fundo dela ficar preto)', displaySoftware: 'Sem a placa de vídeo (se continuar preto)',
    show: 'Trazer de volta', hide: 'Guardar',
    size: 'Tamanho', small: 'Pequena', medium: 'Média', large: 'Grande', sound: 'Som', mute: 'Sem som',
    soundsDir: 'Abrir a pasta de sons personalizados', screen: 'Tela', wander: 'Passear quando nada acontece',
    possess: 'Possuir minhas janelas', lang: 'Idioma', auto: 'Automático (sistema)', startup: 'Iniciar com o Windows',
    hooksOn: 'Hooks do Claude Code: instalados', hooksOff: 'Instalar os hooks do Claude Code',
    hooksRemove: 'Remover os hooks do Claude Code', forget: 'Esquecer nossas conversas', quit: 'Sair',
    sync: (percent, stage) => `Ela e você: ${percent} % · ${stage}`, stages: ['Sinal fraco', 'Contato', 'Sintonia', 'Vínculo', 'Fusão'],
    reminders: 'Lembretes', noReminders: 'Nenhum lembrete (peça no chat dela)', cancelReminder: 'Cancelar este lembrete',
    follow: 'Me seguir de uma tela pra outra', jealous: 'Com ciúmes de outras IAs', closePages: 'Fechar as páginas de outras IAs',
    lookNow: 'Olha minha tela', lookAuto: 'Olhar minha tela de vez em quando',
    pcReact: 'Reagir ao meu PC',
    cloudFree: 'grátis, online', cloudSignin: 'Entrar no Ollama (modelos na nuvem grátis)…',
  },
  ru: {
    name: 'Русский',
    online: (port) => `Capri — слушаю порт ${port}`,
    teleport: 'Телепортироваться', satellite: 'Посмотреть на спутник', lightUp: 'Закурить', demo: 'Запустить демо', help: 'Как это работает?',
    report: 'Отчёт о миссиях', talk: 'Поговорить с ней',
    moreLines: 'Придумать ей новые фразы…', custom: 'Настроить её…', chatModel: 'ИИ-модель', aiSetup: 'Выбрать вместе с ней…', apiKey: 'API-ключ или адрес…', noOllama: 'Ollama не найдена',
    character: 'Персонаж', characterFolder: 'Открыть папку персонажей…',
    rest: 'Когда она отдыхает', restCorner: 'В своём углу', restTaskbar: 'Сидит на панели задач', watch: 'Что отслеживать', watchNone: 'Ничего, просто будь рядом',
    theme: 'Стиль её окон', themeClassic: 'Классический',
    motion: 'Анимации', motionAuto: 'Как в Windows', motionFull: 'Все', motionReduced: 'Минимум',
    display: 'Отображение', displayAuto: 'Обычное', displayGl: 'OpenGL (если её фон чёрный)', displaySoftware: 'Без видеокарты (если всё ещё чёрный)',
    show: 'Вернуть её', hide: 'Спрятать',
    size: 'Размер', small: 'Маленькая', medium: 'Средняя', large: 'Большая', sound: 'Звук', mute: 'Без звука',
    soundsDir: 'Открыть папку своих звуков', screen: 'Экран', wander: 'Гулять, когда ничего не происходит',
    possess: 'Вселяться в мои окна', lang: 'Язык', auto: 'Автоматически (системный)', startup: 'Запускать вместе с Windows',
    hooksOn: 'Хуки Claude Code: установлены', hooksOff: 'Установить хуки Claude Code',
    hooksRemove: 'Удалить хуки Claude Code', forget: 'Забыть наши разговоры', quit: 'Выйти',
    sync: (percent, stage) => `Вы с ней: ${percent} % · ${stage}`, stages: ['Слабый сигнал', 'Контакт', 'Синхрон', 'Связь', 'Слияние'],
    reminders: 'Напоминания', noReminders: 'Напоминаний нет (попроси в её чате)', cancelReminder: 'Отменить напоминание',
    follow: 'Следовать за мной с экрана на экран', jealous: 'Ревнует к другим ИИ', closePages: 'Закрывать страницы других ИИ',
    lookNow: 'Посмотри на мой экран', lookAuto: 'Иногда смотреть на мой экран',
    pcReact: 'Реагировать на мой ПК',
    cloudFree: 'бесплатно, онлайн', cloudSignin: 'Войти в Ollama (бесплатные облачные модели)…',
  },
};

// A character who isn't her (skin.json's "gender": "m"): the menu calls him "him", not "her".
// Only the keys that say she/he; everything else is neutral.
const TRAY_M = {
  fr: {
    talk: 'Lui parler', custom: 'Le personnaliser…', aiSetup: 'Choisir avec lui…',
    rest: 'Quand il se repose', theme: 'Le style de ses fenêtres', show: 'Le ramener',
    displayGl: 'OpenGL (si son fond est noir)',
    sync: (percent, stage) => `Vous et lui : ${percent} % · ${stage}`,
    noReminders: 'Aucun rappel (demande-lui dans son chat)',
  },
  en: {
    talk: 'Talk to him', custom: 'Make him yours…', aiSetup: 'Set it up with him…',
    rest: 'When he rests', theme: 'His window style', show: 'Bring him back',
    displayGl: 'OpenGL (if his background is black)',
    sync: (percent, stage) => `You and him: ${percent} % · ${stage}`,
    noReminders: 'No reminders (ask in his chat)',
  },
  es: {
    talk: 'Hablar con él', custom: 'Personalizarlo…', aiSetup: 'Elegir con él…',
    rest: 'Cuando él descansa', theme: 'El estilo de sus ventanas', show: 'Traerlo de vuelta',
    displayGl: 'OpenGL (si su fondo es negro)',
    sync: (percent, stage) => `Tú y él: ${percent} % · ${stage}`,
    noReminders: 'Sin recordatorios (pídeselo en su chat)',
  },
  pt: {
    talk: 'Falar com ele', custom: 'Personalizar…', aiSetup: 'Escolher com ele…',
    rest: 'Quando ele descansa', theme: 'O estilo das janelas dele', show: 'Trazer ele de volta',
    displayGl: 'OpenGL (se o fundo dele estiver preto)',
    sync: (percent, stage) => `Você e ele: ${percent} % · ${stage}`,
    noReminders: 'Sem lembretes (peça no chat dele)',
  },
  ru: {
    talk: 'Поговорить с ним', custom: 'Настроить его…', aiSetup: 'Выбрать вместе с ним…',
    rest: 'Когда он отдыхает', theme: 'Стиль его окон', show: 'Вернуть его',
    displayGl: 'OpenGL (если его фон чёрный)',
    sync: (percent, stage) => `Вы с ним: ${percent} % · ${stage}`,
    noReminders: 'Напоминаний нет (попроси в его чате)',
    small: 'Маленький', medium: 'Средний', large: 'Большой',
  },
};

// What a character's drawings are called in her menu (skin.json's "poses" and "sequences")
const POSE_LABELS = {
  fr: {
    crossed: 'Bras croisés', smoke: 'Avec une cigarette', crouch: 'Accroupi', pistol: 'Pistolet sorti',
    back: 'De dos', glasses1: 'Avec ses lunettes', glasses2: 'Retire ses lunettes', glasses3: 'Sans lunettes',
    noglasses: 'Sans lunettes', holo: 'Hologramme', glasses: 'Retirer ses lunettes',
    sad: 'Tristesse, assis', idle: 'Respiration',
  },
  en: {
    crossed: 'Arms crossed', smoke: 'Smoking', crouch: 'Crouching', pistol: 'Pistol drawn',
    back: 'From behind', glasses1: 'With his sunglasses', glasses2: 'Taking them off', glasses3: 'No sunglasses',
    noglasses: 'No sunglasses', holo: 'Hologram', glasses: 'Take off his sunglasses',
    sad: 'Sad, sitting', idle: 'Breathing',
  },
  es: {
    crossed: 'Brazos cruzados', smoke: 'Con un cigarro', crouch: 'Agachado', pistol: 'Pistola en mano',
    back: 'De espaldas', glasses1: 'Con gafas', glasses2: 'Se quita las gafas', glasses3: 'Sin gafas',
    noglasses: 'Sin gafas', holo: 'Holograma', glasses: 'Quitarse las gafas',
    sad: 'Triste, sentado', idle: 'Respiración',
  },
  pt: {
    crossed: 'Braços cruzados', smoke: 'Com um cigarro', crouch: 'Agachado', pistol: 'Pistola na mão',
    back: 'De costas', glasses1: 'Com óculos', glasses2: 'Tirando os óculos', glasses3: 'Sem óculos',
    noglasses: 'Sem óculos', holo: 'Holograma', glasses: 'Tirar os óculos',
    sad: 'Triste, sentado', idle: 'Respiração',
  },
  ru: {
    crossed: 'Руки скрещены', smoke: 'С сигаретой', crouch: 'На корточках', pistol: 'С пистолетом',
    back: 'Со спины', glasses1: 'В очках', glasses2: 'Снимает очки', glasses3: 'Без очков',
    noglasses: 'Без очков', holo: 'Голограмма', glasses: 'Снять очки',
    sad: 'Грусть, сидя', idle: 'Дыхание',
  },
};

// The work half of her menu: a work order, what she may run inside its folder, and the round where she
// learns from you. Kept apart from TRAY so the older menus read the same as they always did.
const WORK = {
  en: {
    work: 'Work', giveWork: 'Give her work…', workState: 'The work order',
    autonomy: 'What she may run', autonomyGuard: 'Project tools (node, git, python…)',
    autonomyTrusted: 'Anything but the destructive ones',
    autonomyFull: 'Everything, a shell too (like the harness)',
    learn: 'Learn from me', harnessFolder: 'Open her harness folder…',
  },
  fr: {
    work: 'Travail', giveWork: 'Donne-lui du travail…', workState: 'La commande en cours',
    autonomy: 'Ce qu\'elle peut lancer', autonomyGuard: 'Les outils du projet (node, git, python…)',
    autonomyTrusted: 'Tout sauf le destructeur',
    autonomyFull: 'Tout, un shell compris (comme le harnais)',
    learn: 'Apprends de moi', harnessFolder: 'Ouvrir le dossier de ses prompts…',
  },
  es: {
    work: 'Trabajo', giveWork: 'Dale trabajo…', workState: 'El encargo',
    autonomy: 'Qué puede ejecutar', autonomyGuard: 'Herramientas del proyecto (node, git, python…)',
    autonomyTrusted: 'Todo menos lo destructivo',
    autonomyFull: 'Todo, también un intérprete (como el arnés)',
    learn: 'Aprende de mí', harnessFolder: 'Abrir la carpeta de sus prompts…',
  },
  pt: {
    work: 'Trabalho', giveWork: 'Dá-lhe trabalho…', workState: 'A ordem em curso',
    autonomy: 'O que ela pode correr', autonomyGuard: 'Ferramentas do projeto (node, git, python…)',
    autonomyTrusted: 'Tudo menos o destrutivo',
    autonomyFull: 'Tudo, um shell também (como o harness)',
    learn: 'Aprende comigo', harnessFolder: 'Abrir a pasta dos seus prompts…',
  },
  ru: {
    work: 'Работа', giveWork: 'Дай ей работу…', workState: 'Текущая работа',
    autonomy: 'Что ей можно запускать', autonomyGuard: 'Инструменты проекта (node, git, python…)',
    autonomyTrusted: 'Всё, кроме разрушительного',
    autonomyFull: 'Всё, включая shell (как у харнесса)',
    learn: 'Поучись у меня', harnessFolder: 'Открыть папку её промптов…',
  },
};

// Updates from the releases on GitHub: the menu entries and the sentences the panel shows when a new
// version is out, when it is downloaded, and when the check itself failed.
const UPDATE = {
  en: {
    updates: 'Updates', updateCheck: 'Check for updates…', updateInstall: 'Install the downloaded update and restart',
    updateAvailable: (v) => `Version ${v} is out`, updateDownload: 'Download', updateLater: 'Later',
    updateReady: (v) => `${v} is downloaded`, updateRestart: 'Restart and update',
    updateDownloading: (v) => `Downloading ${v}…`,
    updateRestarting: 'Restarting to update…', updateBusy: 'a work order is still running', updateFromSource: 'running from source: update from a release build',
    updateNone: (v) => `You're on the newest one (${v})`, updateFailed: (e) => `The update check failed: ${e}`,
    updateNoFile: 'That release has no portable exe',
  },
  fr: {
    updates: 'Mises à jour', updateCheck: 'Chercher une mise à jour…', updateInstall: 'Installer celle qui est téléchargée et redémarrer',
    updateAvailable: (v) => `La version ${v} est sortie`, updateDownload: 'Télécharger', updateLater: 'Plus tard',
    updateReady: (v) => `${v} est téléchargée`, updateRestart: 'Redémarrer et mettre à jour',
    updateDownloading: (v) => `Téléchargement de ${v}…`,
    updateRestarting: 'Redémarrage pour la mise à jour…', updateBusy: 'une commande tourne encore', updateFromSource: 'lancé depuis le code : mets à jour depuis une release',
    updateNone: (v) => `Tu as la dernière (${v})`, updateFailed: (e) => `La recherche a échoué : ${e}`,
    updateNoFile: 'Cette release n’a pas d’exe portable',
  },
  es: {
    updates: 'Actualizaciones', updateCheck: 'Buscar actualizaciones…', updateInstall: 'Instalar la descargada y reiniciar',
    updateAvailable: (v) => `Salió la versión ${v}`, updateDownload: 'Descargar', updateLater: 'Más tarde',
    updateReady: (v) => `${v} está descargada`, updateRestart: 'Reiniciar y actualizar',
    updateDownloading: (v) => `Descargando ${v}…`,
    updateRestarting: 'Reiniciando para actualizar…', updateBusy: 'un encargo sigue en marcha', updateFromSource: 'desde el código: actualiza desde una release',
    updateNone: (v) => `Tienes la última (${v})`, updateFailed: (e) => `La búsqueda falló: ${e}`,
    updateNoFile: 'Esa release no trae un exe portable',
  },
  pt: {
    updates: 'Atualizações', updateCheck: 'Procurar atualizações…', updateInstall: 'Instalar a descarregada e reiniciar',
    updateAvailable: (v) => `Saiu a versão ${v}`, updateDownload: 'Descarregar', updateLater: 'Mais tarde',
    updateReady: (v) => `${v} está descarregada`, updateRestart: 'Reiniciar e atualizar',
    updateDownloading: (v) => `A descarregar ${v}…`,
    updateRestarting: 'A reiniciar para atualizar…', updateBusy: 'uma ordem ainda está a correr', updateFromSource: 'a correr do código: atualiza a partir de uma release',
    updateNone: (v) => `Estás na mais recente (${v})`, updateFailed: (e) => `A verificação falhou: ${e}`,
    updateNoFile: 'Essa release não tem um exe portátil',
  },
  ru: {
    updates: 'Обновления', updateCheck: 'Проверить обновления…', updateInstall: 'Установить скачанное и перезапустить',
    updateAvailable: (v) => `Вышла версия ${v}`, updateDownload: 'Скачать', updateLater: 'Позже',
    updateReady: (v) => `${v} скачана`, updateRestart: 'Перезапустить и обновить',
    updateDownloading: (v) => `Скачиваю ${v}…`,
    updateRestarting: 'Перезапускаюсь для обновления…', updateBusy: 'работа ещё идёт', updateFromSource: 'запущено из исходников: обновляйся из релиза',
    updateNone: (v) => `У тебя последняя (${v})`, updateFailed: (e) => `Проверка обновлений не удалась: ${e}`,
    updateNoFile: 'В этом релизе нет portable-файла',
  },
};

// "Check my access": what she can do right now, said to the owner in one line and four facts.
const ACCESS = {
  en: {
    access: 'Check my access…',
    accessLine: (tools, level) => `${tools} tools · level ${level}`,
    accessNoModel: 'No model — nothing will answer until one is set up',
    accessNoTools: 'This provider takes no tools: she can talk, but not look or act',
  },
  fr: {
    access: 'Vérifier mes accès…',
    accessLine: (tools, level) => `${tools} outils · niveau ${level}`,
    accessNoModel: 'Pas de modèle — rien ne répondra avant d’en choisir un',
    accessNoTools: 'Ce fournisseur n’accepte pas d’outils : elle parle, mais ne regarde ni n’agit',
  },
  es: {
    access: 'Comprobar mi acceso…',
    accessLine: (tools, level) => `${tools} herramientas · nivel ${level}`,
    accessNoModel: 'Sin modelo: nada responderá hasta elegir uno',
    accessNoTools: 'Este proveedor no acepta herramientas: habla, pero no mira ni actúa',
  },
  pt: {
    access: 'Verificar o meu acesso…',
    accessLine: (tools, level) => `${tools} ferramentas · nível ${level}`,
    accessNoModel: 'Sem modelo: nada responde até escolheres um',
    accessNoTools: 'Este fornecedor não aceita ferramentas: fala, mas não vê nem age',
  },
  ru: {
    access: 'Проверить мой доступ…',
    accessLine: (tools, level) => `инструментов: ${tools} · уровень ${level}`,
    accessNoModel: 'Нет модели — ничего не ответит, пока она не выбрана',
    accessNoTools: 'Провайдер не принимает инструменты: говорить может, смотреть и делать — нет',
  },
};


// the guitar in her menu
const GUITAR = {
  fr: 'Jouer de la guitare',
  en: 'Play the guitar',
  es: 'Tocar la guitarra',
  pt: 'Tocar violão',
  ru: 'Играть на гитаре',
};

module.exports = {
  GUITAR, TRAY, TRAY_M, POSE_LABELS, WORK, UPDATE, ACCESS, LANGS: Object.keys(TRAY) };
