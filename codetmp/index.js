let L = console.log;
let $ = function(selector, node=document) { let nodes = node.querySelectorAll(selector); return selector.startsWith('#') ? nodes[0] : nodes }
let iframeResolver = [];
let activeWorkspace = 0;

// load component file and add as object key
let components = {};

function getComponent(name) {
  if (typeof(components[name]) != 'undefined') {
    return components[name];
  }
  return null;
}

function getComponentAsPromise(name) {
  return new Promise((resolve, reject) => {
    if (typeof(components[name]) != 'undefined')
      resolve(components[name]);
    reject(name);
  })
}

function registerComponent(name, componentObj) {
  if (typeof(components[name]) != 'undefined') {
    console.log(`Failed to register component ${name}. Component already exists.`);
  } else {
    components[name] = componentObj;    
  }
}
    
(function() {

  let components = [
    {
      urls: [
        'views/modals.html',
        'views/templates.html',
      ],
      callback: function() {
        window.removeEventListener('message', messageHandler);
      }
    },
    {
		urls: [
    	'js/components/ext-firebase.js',
        'assets/js/fflate.js',
        'assets/js/sha256.js',
        ],
        isConnectionRequired: true,
    },
    {
      urls: [
        'js/components/support.js',
        'js/components/helper.js',
        'js/components/extension.js',
        'js/components/preferences.js',
        'js/components/modal.js',
        'js/components/clipboard.js',
        'js/require/lsdb.js',
      ],
    },
    {
      urls: [
        'js/require/o.js',
        'js/require/keyboard.js',
        'js/require/odin.js',
        'js/components/preview.js',
        'js/components/file-manager.js',
        'js/ux.js',
        'js/components/notifier.js',
        'assets/ace/ace.js',
      ],
      callback: function() {
        loadStorageData();
        // logWarningMessage();
        ace.config.set('basePath', 'assets/ace');
      },
    },
    {
      urls: [
        'js/dom-events.js',
        'css/file-tree.css',
        'js/components/file-tree.js',
      ],
      callback: function() {
        initUI();
      },
    },
    {
      urls: [
        'js/components/keyboard-handler.js',
        'js/components/file-reader.js',
        'js/components/template.js',
        'js/require/divless.js',
      ],
      callback: function() {
        fileReaderModule.init();
        keyboardHandler.init();
      },
    },
    {
      urls: [
        'js/require/aww.js',
        'js/require/auth2helper.js',
        'js/components/drive.js',
        'js/components/defer-feature-1.js',
        'js/components/defer-feature-2.js',
      ],
    },
    {
      urls: [
        'js/components/single-file-generator.js',
      ],
    },
    {
      urls: [
        'js/require/jszip.min.js',
      ],
      callback: function() {
      	support.check('JSZip');
      },
    },
    {
      urls: [
        'js/components/git.js',
        'https://apis.google.com/js/platform.js?onload=renderSignInButton',
      ],
    },
  ];

  function loadComponents() {
    if (index >= 0 && components[index].callback)
      components[index].callback();
    index++;
    if (index < components.length)
      loadExternalFiles(components[index].urls, components[index].isConnectionRequired).then(loadComponents);
  }

  function loadStorageData() {

    let fileStructure = {
      root: {
        rootId: '',
        files: [],
        folders: [],
        sync: [],
        counter: {
          files: 0,
          folders: 0
        }
      },
    
      folders:{
        fid: 0,
        parentId: -1,
        
        id: '',
        name: '',
        modifiedTime: '',
        trashed: false,
        isLoaded: true,
        isSync: false,
        isTemp: false,
      },
      files: {
        fid: 0,
        parentId: -1,
        modifiedTime: '',
        isLock: false,
        isTemp: false,
        loaded: false,
        
        contentLink: '',
        id: '',
        name: '',
        content: '',
        trashed: false,
        fileRef: {},
      },
      sync: {
        action: '',
        fid: -1,
        source: -1,
        metadata: [],
        type: '',
        isTemp: false,
      },
    };
    let mainStorage = new lsdb('file-storage', fileStructure);
    window.mainStorage = mainStorage;
    let tempStorage = new lsdb('temp-file-storage', fileStructure, {
      isStoreData: false,
    });
    let workspaces = [mainStorage, tempStorage];
    Object.defineProperty(window, 'fileStorage', { 
      get: () => workspaces[activeWorkspace],
    });

    for (var i = 0; i < mainStorage.data.files.length; i++) {
    	if (mainStorage.data.files[i].isTemp) {
    		mainStorage.data.files[i].loaded = false;
    	}
    }
    mainStorage.save();
    
    window.settings = new lsdb('settings', {
      root: {
        gitToken: '',
        drive: {
          startPageToken: ''
        },
        editor: {
          emmetEnabled: false,
          autoCompleteEnabled: true,
          divlessHTMLEnabled: false,
          wordWrapEnabled: true,
        },
        explorer: {
          view: 'grid',
          tree: false,
        },
        showHomepage: true,
        autoSync: true,
        saveGitToken: false,
      }
    });
  }

  function messageHandler(e) {
    let div = document.createElement('div');
    div.innerHTML = e.data.content;
    
    let fragment = document.createDocumentFragment();
    for (let node of $('.Export', div)) {
      node.classList.toggle('Export', false);
      fragment.appendChild(node);
    }

    document.body.append(fragment);
    let resolver = iframeResolver.pop();
    resolver();
  }

  Promise.all([
    new Promise(resolve => {
      let interval = setInterval(() => {
        if (document.querySelector('[data-callback="btn-menu-preview"]').firstElementChild.scrollWidth > 50) return;
        clearInterval(interval);
        resolve();
      }, 100);
    })
  ]).then(() => {
    document.querySelector('#preload-material').parentNode.removeChild(document.querySelector('#preload-material'));
  });

  window.addEventListener('message', messageHandler);

  let index = -1;
  loadComponents();

})();

function requireExternalFiles(url) {
  
  return new Promise((resolve, reject) => {
    
    if (url.includes('.html')) {
      let el = document.createElement('iframe');
      el.setAttribute('name', 'preload-'+url);
      $('#limbo').append(el);
      window.open(url, 'preload-'+url);
      iframeResolver.push(resolve);
    } else {
      let el;
      if (url.includes('.css')) {
        el = document.createElement('link');
        el.setAttribute('href', url);
        el.setAttribute('rel', 'stylesheet');
      } else {
        el = document.createElement('script');
        el.setAttribute('src', url);
      }
      el.onload = () => resolve(url);
      el.onerror = () => reject(url);
      document.head.appendChild(el);
    } 
  });
};

function loadExternalFiles(URLs, isConnectionRequired = false) {
  return new Promise(resolve => {
    let bundleURL = [];
    for (let URL of URLs)
      bundleURL.push(requireExternalFiles(URL));
    Promise.all(bundleURL).then(() => {
      resolve();
    }).catch(error => {
      console.log(error);
      console.log('Could not load one or more required file(s).');
      if (isConnectionRequired)
      	resolve();
    });
  });
}