let previewUrl = 'https://cpreview.web.app/';
let previewFrameResolver = null;
let previewWindow = null;
let portResolver = null;
let PreviewLoadWindow = null;
let isPreviewFrameLoaded = false;
let isPortOpened = false;
let previewManager = new PreviewManager();
let windows = [];
let previewMode = 'normal';

function PreviewManager() {

  let driveAccessToken = '';

  function removeParam(url) {
    var oldURL = url;
    var index = 0;
    var newURL = oldURL;
    index = oldURL.indexOf('?');
    if(index == -1){
        index = oldURL.indexOf('#');
    }
    if(index != -1){
        newURL = oldURL.substring(0, index);
    }
    return newURL;
  }

  new Promise(function(resolve) {
    if (isPreviewFrameLoaded) 
      resolve();
    else {
      previewFrameResolver = resolve;
    }
  })
  .then(() => {
      let messageChannel = new MessageChannel();
      messageChannel.port1.onmessage = previewManager.fileResponseHandler;

      previewLoadWindow.postMessage({ message: 'init-message-port' }, '*', [messageChannel.port2]);
      new Promise(function(resolve) {
        portResolver = resolve;
      })
  });

  if (!isPreviewFrameLoaded)
    previewLoadWindow = window.open(previewUrl, 'PreviewFrame');

  async function responseAsMedia(event, path, mimeType) {

  	let file = getFileAtPath(path).file;
    if (file === null) {
      previewLoadWindow.postMessage({
        message: 'response-file', 
        mime: '',
        content: '<404></404>',
        resolverUID: event.data.resolverUID,
      }, '*');
    } else {

      if (file.isTemp && file.content === null) {
        
        previewLoadWindow.postMessage({
          message: 'response-file', 
          mime: helper.getMimeType(file.name),
          content: file.fileRef,
          resolverUID: event.data.resolverUID,
        }, '*');

      } else { 

        if (helper.isMediaTypeMultimedia(mimeType)) {
          let data = {
            contentLink: drive.apiUrl+'files/'+file.id+'?alt=media',
            source: 'drive',
          };
        	
          if (helper.isHasSource(file.content)) {
  	    		data.contentLink = helper.getRemoteDataContent(file.content).downloadUrl;
            data.source = 'git';
	      	} else {
            await auth2.init();
            data.accessToken = driveAccessToken;
          }

          previewLoadWindow.postMessage({
            message: 'response-file-multimedia', 
            mime: mimeType,
            content: data,
            resolverUID: event.data.resolverUID,
          }, '*');
        } else {
          previewLoadWindow.postMessage({
            message: 'response-file', 
            mime: mimeType,
            content: new Blob([file.content]),
            resolverUID: event.data.resolverUID,
          }, '*');         
        }
      }
    }
  }

  function responseAsText(event, path, mimeType) {
  	previewLoadWindow.postMessage({
  		message: 'response-file', 
  		mime: mimeType,
  		content: previewManager.getContent(path, mimeType),
  		resolverUID: event.data.resolverUID,
  	}, '*');
  }

	this.fileResponseHandler = function (event) {
	  if (event.data.method && event.data.path == '/codetmp/files') {
      switch (event.data.method) {
        case 'POST':
          if (event.data.referrer) {
            let parentDir = previewManager.getDirectory(event.data.referrer, null, ['root']);
            let file = new File({
              name: event.data.body.name,
              content: event.data.body.content,
              parentId: previewManager.getDirectory(event.data.body.path, parentDir, ['root']),
            });
            fileManager.sync(file.fid, 'create', 'files');
            drive.syncToDrive();
            fileStorage.save();
            fileManager.list();
          }

          previewLoadWindow.postMessage({
            message: 'response-file', 
            mime: 'text/html;charset=UTF-8',
            content: 'Done.',
            resolverUID: event.data.resolverUID,
          }, '*');
          break;
        case 'PATCH':
          if (event.data.referrer) {
            let parentDir = previewManager.getDirectory(event.data.referrer, null, ['root']);
            let parentId = previewManager.getDirectory(event.data.body.path, parentDir, ['root']);
            let files = fileManager.listFiles(parentId);
            let name = event.data.body.path.replace(/.*?\//g,'');
            let isFileFound = false;
            let file;
            for (let i=0; i<files.length; i++) {
              if (files[i].name == name && !files[i].trashed) {
                isFileFound = true;
                file = files[i];
                break;
              }
            }
            if (isFileFound) {
              file.loaded = false;
              fileManager.downloadMedia(file).then(() => {
  		          previewLoadWindow.postMessage({
  		            message: 'response-file', 
  		            mime: 'text/html;charset=UTF-8',
  		            content: 'Updated.',
  		            resolverUID: event.data.resolverUID,
  		          }, '*');
              }).catch(() => {
  	            file.loaded = true;
  				      previewLoadWindow.postMessage({
  		            message: 'response-file', 
  		            mime: 'text/html;charset=UTF-8',
  		            content: 'Update failed.',
  		            resolverUID: event.data.resolverUID,
  		          }, '*');
              })
            }
          }
          break;
        case 'PUT':
          if (event.data.referrer) {
            let parentDir = previewManager.getDirectory(event.data.referrer, null, ['root']);
            let parentId = previewManager.getDirectory(event.data.body.path, parentDir, ['root']);
            let files = fileManager.listFiles(parentId);
            let name = event.data.body.path.replace(/.*?\//g,'');
            let isFileFound = false;
            let file;
            for (let i=0; i<files.length; i++) {
              if (files[i].name == name && !files[i].trashed) {
                isFileFound = true;
                file = files[i];
                break;
              }
            }
            if (isFileFound) {
              file.content = event.data.body.content;
              file.modifiedTime = new Date().toISOString();
              handleSync({
                fid: file.fid,
                action: 'update',
                metadata: ['media'],
                type: 'files'
              });
              drive.syncToDrive();
              fileStorage.save();
            }
          }

          previewLoadWindow.postMessage({
            message: 'response-file', 
            mime: 'text/html;charset=UTF-8',
            content: 'Done.',
            resolverUID: event.data.resolverUID,
          }, '*');
          break;
      }
    } else {
      let path = decodeURI(removeParam(event.data.path));
      let mimeType = helper.getMimeType(path);
      if (helper.isMediaTypeText(path)) {
        responseAsText(event, path, mimeType+'; charset=UTF-8');
      } else {
        responseAsMedia(event, path, mimeType);
      }
    }
  }

  function getFileAtPath(src) {
    let preParent = activeFolder;
    let relativeParent = preParent;
    let path = ['root'];
    let parentId = previewManager.getDirectory(src, relativeParent, path);
    let files = fileManager.listFiles(parentId);
    let name = src.replace(/.*?\//g,'');
    let isFileFound = false;
    let file = null;
    for (let i=0; i<files.length; i++) {
      if (files[i].name.toLowerCase() == name.toLowerCase() && !files[i].trashed) {
        file = files[i];
        break;
      }
    }
    return { file, parentId };
  }

	this.getContent = function(src, mimeType) {

    if (src == '/untitled.html') {
    	let content = replaceTemplate(fileTab[activeTab].editor.env.editor.getValue());
      if (settings.data.editor.divlessHTMLEnabled)
        return divless.replace(content);
      return content;
    }

    let content = '<404></404>';
    let filePath = getFileAtPath(src);
    let file = filePath.file;
    let parentId = filePath.parentId;

    if (file !== null) {
      if (file.isTemp && file.content === null) {    
        return file.fileRef;
      } else if (!file.loaded) {
        aww.pop('Downloading required file : '+file.name);
        fileManager.downloadMedia(file);
	        content = '';
      } else {
        let tabIdx = odin.idxOf(file.fid, fileTab, 'fid');
        if (tabIdx >= 0)
          content = (activeFile && activeFile.fid === file.fid) ? fileTab[activeTab].editor.env.editor.getValue() : fileTab[tabIdx].editor.env.editor.getValue();
        else
          content = file.content;
      }
      content = replaceTemplate(content, parentId)
      if (settings.data.editor.divlessHTMLEnabled && mimeType.match(/text\/html|text\/xml/)) {
        content = divless.replace(content);
      }
    }
    return content;
  }

  this.getFrameName = function() {
    let file = activeFile;
    let name = (previewMode == 'inframe') ? 'inframe-preview' : 'preview';
    name = 'preview-'+file.fid;
    return name;
  }

  this.getDirectory = function(source, parentId, path) {
    source = decodeURI(source);
    while (source.match('//')) {
      source = source.replace('//','/');
    }
    
    let dir = source.split('/').reverse();
    let folder;
    
    while (dir.length > 1) {
      
  	  let dirName = dir.pop();

      if (dirName === '') {
      	parentId = -1;
      } else if (dirName === '..' || dirName === '.') {
        
        folder = odin.dataOf(parentId, fileStorage.data.folders, 'fid');
        if (folder === undefined) {
          break;
        }
        path.pop();
        parentId = folder.parentId;
      } else {
        
        let folders = fileManager.listFolders(parentId);
        for (let f of folders) {
          if (f.name.toLowerCase() == dirName.toLowerCase() && !f.trashed) {
            folder = f;
            break;
          }
        }
        if (folder) {
          if (!folder.isLoaded) {
            drive.syncFromDrivePartial([folder.id]);
            break;
          }
          parentId = folder.fid;
          path.push(folder.name);
        } else {
          parentId = -2;
          break;
        }
      }
    }
    
    return parentId;
  }

  this.getPath = function() {

    let file;

    if (activeFile != null) {
      file = activeFile;
    }

  	if (typeof(file) == 'undefined') {
  		return 'untitled.html';
  	}

  	let path = [file.name];
  	let parentId = file.parentId;
  	
    while (parentId >= 0) {
  		let folder = odin.dataOf(parentId, fileStorage.data.folders, 'fid');
  		path.push(folder.name);
  		parentId = parseInt(folder.parentId);
  	}
  	return path.reverse().join('/');

  }

  this.setToken = function(token) {
    driveAccessToken = token;
  }

  return this;
}

function getMatchTemplate(content) {
	return content.match(/<file src=.*?><\/file>/);
}

function replaceFile(match, body, preParent, path) {
  let src = match[0].substring(11, match[0].length-9);
  let relativeParent = preParent;
  let parentId = previewManager.getDirectory(src, relativeParent, path);
  let files = fileManager.listFiles(parentId);
  let name = src.replace(/.*?\//g,'');
  let file = null;
  for (let i=0; i<files.length; i++) {
    if (files[i].trashed) {
      continue;
    } else if (files[i].name == name) {
      file = files[i];
    }
  }
  if (file === null) {
    body = body.replace(match[0], '');
    aww.pop('Required file not found : '+src);
  } else {
    let content = '';
    if (!file.loaded) {
      fileManager.downloadMedia(file);
    } else {
      let tabIdx = odin.idxOf(file.fid, fileTab, 'fid');
      if (tabIdx >= 0)
        content = (activeFile && activeFile.fid === file.fid) ? fileTab[activeTab].editor.env.editor.getValue() : fileTab[tabIdx].editor.env.editor.getValue();
      else
        content = file.content;
    }
    let swap = replaceTemplate(content, parentId, path);
    body = body.replace(new RegExp(match[0]), swap);
  }
  return body;
}

function replaceTemplate(body, preParent = -1, path = ['root']) {
  let match = getMatchTemplate(body);
  while (match !== null) {
    let searchPath = JSON.parse(JSON.stringify(path));
    body = replaceFile(match, body, preParent, searchPath);
    match = getMatchTemplate(body);
  }
  return body;
}

(function() {
  
  function previewWeb(filePath) {
	  new Promise(function(resolve) {
	  	if (isPreviewFrameLoaded) 
	  		resolve();
	  	else {
	  		previewFrameResolver = resolve;
	  	}
	  })
	  .then(() => {
	  	  let messageChannel = new MessageChannel();
		    messageChannel.port1.onmessage = previewManager.fileResponseHandler;
	      previewLoadWindow.postMessage({ message: 'init-message-port' }, '*', [messageChannel.port2]);
        // delayed to focus
        setTimeout(function() {
          window.open(previewUrl+filePath, previewManager.getFrameName());
        }, 1);
	  });
  }

  function previewHTML() {
	  let filePath = previewManager.getPath();
     previewWeb(filePath);
  }

  window.previewHTML = previewHTML;
  
})();

// DOM events

window.addEventListener('message', function(e) {
  if (e.data.message) {
    switch (e.data.message) {
	case 'html-snippet':
      let editor = fileTab[0].editor.env.editor;
      editor.setValue(e.data.html);
      editor.clearSelection();
      editor.moveCursorTo(0,0);
    break;
    case 'port-missing':
      isPortOpened = false;
      let messageChannel = new MessageChannel();
      messageChannel.port1.onmessage = previewManager.fileResponseHandler;
      previewLoadWindow.postMessage({ message: 'reinit-message-port' }, '*', [messageChannel.port2]);
    break;
    case 'message-port-opened':
    	portResolver();
    break;
    case 'preview-frame-isReady':
        isPreviewFrameLoaded = true;
        previewFrameResolver();
        break;
    }
  }

}, false);

// DOM events

navigator.serviceWorker.addEventListener('message', e => {
  if (e.data.type) {
    switch (e.data.type) {
      case 'extension':
        extension.load(e.data.name);
    }
  }
});