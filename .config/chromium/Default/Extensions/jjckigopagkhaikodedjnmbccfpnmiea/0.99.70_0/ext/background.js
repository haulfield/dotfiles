
(function()
{
  var nonEmptyPageMaps = Object.create(null);
  var pageMapCounter = 0;
  var PageMap = ext.PageMap = function()
  {
    this._map = Object.create(null);
    this._id = ++pageMapCounter;
  };
  PageMap.prototype = {
    _delete: function(id)
    {
      delete this._map[id];
      if (Object.keys(this._map).length == 0)
      {
        delete nonEmptyPageMaps[this._id];
      }
    },
    keys: function()
    {
      return Object.keys(this._map).map(ext._getPage);
    },
    get: function(page)
    {
      return this._map[page._id];
    },
    set: function(page, value)
    {
      this._map[page._id] = value;
      nonEmptyPageMaps[this._id] = this;
    },
    has: function(page)
    {
      return page._id in this._map;
    },
    clear: function()
    {
      for (var id in this._map)
      {
        this._delete(id);
      }
    },
    delete: function(page)
    {
      this._delete(page._id);
    }
  };
  ext._removeFromAllPageMaps = function(pageId)
  {
    for (var pageMapId in nonEmptyPageMaps)
    {
      nonEmptyPageMaps[pageMapId]._delete(pageId);
    }
  };
})();
(function()
{
  var Page = ext.Page = function(tab)
  {
    this._id = tab.id;
    this._url = tab.url && new URL(tab.url);
    //this.browserAction = new BrowserAction(tab.id);
    this.contextMenus = new ContextMenus(this);
  };
  Page.prototype = {
    get url()
    {
      if (this._url)
      {
        return this._url;
      }
      var frames = framesOfTabs[this._id];
      if (frames)
      {
        var frame = frames[0];
        if (frame)
        {
          return frame.url;
        }
      }
    },
    sendMessage: function(message, responseCallback)
    {
      chrome.tabs.sendMessage(this._id, message, responseCallback);
    }
  };
  ext._getPage = function(id)
  {
    return new Page(
    {
      id: parseInt(id, 10)
    });
  };
  ext.pages = {
    open: function(url, callback)
    {
      if (callback)
      {
        chrome.tabs.create(
        {
          url: url
        }, function(openedTab)
        {
          var onUpdated = function(tabId, changeInfo, tab)
          {
            if (tabId == openedTab.id && changeInfo.status == "complete")
            {
              chrome.tabs.onUpdated.removeListener(onUpdated);
              callback(new Page(tab));
            }
          };
          chrome.tabs.onUpdated.addListener(onUpdated);
        });
      }
      else
      {
        chrome.tabs.create(
        {
          url: url
        });
      }
    },
    query: function(info, callback)
    {
      var rawInfo = {};
      for (var property in info)
      {
        switch (property)
        {
        case "active":
        case "lastFocusedWindow":
          rawInfo[property] = info[property];
        }
      }
      chrome.tabs.query(rawInfo, function(tabs)
      {
        callback(tabs.map(function(tab)
        {
          return new Page(tab);
        }));
      });
    },
    onLoading: new ext._EventTarget(),
    onActivated: new ext._EventTarget(),
    onRemoved: new ext._EventTarget()
  };
  chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab)
  {
    if (changeInfo.status == "loading")
    {
      ext.pages.onLoading._dispatch(new Page(tab));
    }
  });

  function createFrame(tabId, frameId)
  {
    var frames = framesOfTabs[tabId];
    if (!frames)
    {
      frames = framesOfTabs[tabId] = Object.create(null);
    }
    var frame = frames[frameId];
    if (!frame)
    {
      frame = frames[frameId] = {};
    }
    return frame;
  }
  chrome.webNavigation.onBeforeNavigate.addListener(function(details)
  {
    var frame = createFrame(details.tabId, details.frameId);
    frame.parent = framesOfTabs[details.tabId][details.parentFrameId] || null;
  });
  var eagerlyUpdatedPages = new ext.PageMap();
  ext._updatePageFrameStructure = function(frameId, tabId, url, eager)
  {
    if (frameId == 0)
    {
      var page = new Page(
      {
        id: tabId,
        url: url
      });
      if (eagerlyUpdatedPages.get(page) != url)
      {
        ext._removeFromAllPageMaps(tabId);
        if (eager)
        {
          eagerlyUpdatedPages.set(page, url);
        }
        chrome.tabs.get(tabId, function()
        {
          if (chrome.runtime.lastError)
          {
            ext.pages.onLoading._dispatch(page);
          }
        });
      }
    }
    var frame = createFrame(tabId, frameId);
    frame.url = new URL(url);
  };
  chrome.webNavigation.onCommitted.addListener(function(details)
  {
    ext._updatePageFrameStructure(details.frameId, details.tabId, details.url);
  });

  function forgetTab(tabId)
  {
    ext._removeFromAllPageMaps(tabId);
    delete framesOfTabs[tabId];
  }
  chrome.tabs.onReplaced.addListener(function(addedTabId, removedTabId)
  {
    forgetTab(removedTabId);
  });
  chrome.tabs.onRemoved.addListener(forgetTab);
  var BrowserAction = function(tabId)
  {
    this._tabId = tabId;
    this._changes = null;
  };
  BrowserAction.prototype = {
    _applyChanges: function()
    {
      if ("iconPath" in this._changes)
      {
        chrome.browserAction.setIcon(
        {
          tabId: this._tabId,
          path: {
            19: this._changes.iconPath.replace("$size", "19"),
            38: this._changes.iconPath.replace("$size", "38")
          }
        });
      }
      if ("badgeText" in this._changes)
      {
        chrome.browserAction.setBadgeText(
        {
          tabId: this._tabId,
          text: this._changes.badgeText
        });
      }
      if ("badgeColor" in this._changes)
      {
        chrome.browserAction.setBadgeBackgroundColor(
        {
          tabId: this._tabId,
          color: this._changes.badgeColor
        });
      }
      this._changes = null;
    },
    _queueChanges: function()
    {
      chrome.tabs.get(this._tabId, function()
      {
        if (chrome.runtime.lastError)
        {
          var onReplaced = function(addedTabId, removedTabId)
          {
            if (addedTabId == this._tabId)
            {
              chrome.tabs.onReplaced.removeListener(onReplaced);
              this._applyChanges();
            }
          }.bind(this);
          chrome.tabs.onReplaced.addListener(onReplaced);
        }
        else
        {
          this._applyChanges();
        }
      }.bind(this));
    },
    _addChange: function(name, value)
    {
      if (!this._changes)
      {
        this._changes = {};
        this._queueChanges();
      }
      this._changes[name] = value;
    },
    setIcon: function(path)
    {
      this._addChange("iconPath", path);
    },
    setBadge: function(badge)
    {
      if (!badge)
      {
        this._addChange("badgeText", "");
      }
      else
      {
        if ("number" in badge)
        {
          this._addChange("badgeText", badge.number.toString());
        }
        if ("color" in badge)
        {
          this._addChange("badgeColor", badge.color);
        }
      }
    }
  };
  var contextMenuItems = new ext.PageMap();
  var contextMenuUpdating = false;
  var updateContextMenu = function()
  {
    if (contextMenuUpdating)
    {
      return;
    }
    contextMenuUpdating = true;
    chrome.tabs.query(
    {
      active: true,
      lastFocusedWindow: true
    }, function(tabs)
    {
      chrome.contextMenus.removeAll(function()
      {
        contextMenuUpdating = false;
        if (tabs.length == 0)
        {
          return;
        }
        var items = contextMenuItems.get(
        {
          _id: tabs[0].id
        });
        if (!items)
        {
          return;
        }
        items.forEach(function(item)
        {
          chrome.contextMenus.create(
          {
            title: item.title,
            contexts: item.contexts,
            onclick: function(info, tab)
            {
              item.onclick(new Page(tab));
            }
          });
        });
      });
    });
  };
  var ContextMenus = function(page)
  {
    this._page = page;
  };
  ContextMenus.prototype = {
    create: function(item)
    {
      var items = contextMenuItems.get(this._page);
      if (!items)
      {
        contextMenuItems.set(this._page, items = []);
      }
      items.push(item);
      updateContextMenu();
    },
    removeAll: function()
    {
      contextMenuItems.delete(this._page);
      updateContextMenu();
    }
  };
  chrome.tabs.onActivated.addListener(updateContextMenu);
  chrome.windows.onFocusChanged.addListener(function(windowId)
  {
    if (windowId != chrome.windows.WINDOW_ID_NONE)
    {
      updateContextMenu();
    }
  });
  var framesOfTabs = Object.create(null);
  ext.getFrame = function(tabId, frameId)
  {
    return (framesOfTabs[tabId] || {})[frameId];
  };
  var handlerBehaviorChangedQuota = chrome.webRequest.MAX_HANDLER_BEHAVIOR_CHANGED_CALLS_PER_10_MINUTES;

  function propagateHandlerBehaviorChange()
  {
    if (handlerBehaviorChangedQuota > 0)
    {
      chrome.webNavigation.onBeforeNavigate.removeListener(propagateHandlerBehaviorChange);
      chrome.webRequest.handlerBehaviorChanged();
      handlerBehaviorChangedQuota--;
      setTimeout(function()
      {
        handlerBehaviorChangedQuota++;
      }, 600000);
    }
  }
  ext.webRequest = {
    onBeforeRequest: new ext._EventTarget(),
    handlerBehaviorChanged: function()
    {
      var onBeforeNavigate = chrome.webNavigation.onBeforeNavigate;
      if (!onBeforeNavigate.hasListener(propagateHandlerBehaviorChange))
      {
        onBeforeNavigate.addListener(propagateHandlerBehaviorChange);
      }
    },
    getIndistinguishableTypes: function()
    {
      var match = navigator.userAgent.match(/\bChrome\/(\d+)/);
      if (match)
      {
        var version = parseInt(match[1], 10);
        if (version >= 38 && version <= 48)
        {
          return [["OTHER", "OBJECT", "OBJECT_SUBREQUEST"]];
        }
      }
      var ResourceType = chrome.webRequest.ResourceType || {};
      var otherTypes = ["OTHER", "MEDIA"];
      if (!("FONT" in ResourceType))
      {
        otherTypes.push("FONT");
      }
      if (!("PING" in ResourceType))
      {
        otherTypes.push("PING");
      }
      return [["OBJECT", "OBJECT_SUBREQUEST"], otherTypes];
    }
  };
  chrome.tabs.query(
  {}, function(tabs)
  {
    tabs.forEach(function(tab)
    {
      chrome.webNavigation.getAllFrames(
      {
        tabId: tab.id
      }, function(details)
      {
        if (details && details.length > 0)
        {
          var frames = framesOfTabs[tab.id] = Object.create(null);
          for (var i = 0; i < details.length; i++)
          {
            frames[details[i].frameId] = {
              url: new URL(details[i].url),
              parent: null
            };
          }
          for (var i = 0; i < details.length; i++)
          {
            var parentFrameId = details[i].parentFrameId;
            if (parentFrameId != -1)
            {
              frames[details[i].frameId].parent = frames[parentFrameId];
            }
          }
        }
      });
    });
  });
  chrome.webRequest.onBeforeRequest.addListener(function(details)
  {
    if (details.tabId == -1 || details.type == "main_frame")
    {
      return;
    }
    var frameId;
    var requestType;
    if (details.type == "sub_frame")
    {
      frameId = details.parentFrameId;
      requestType = "SUBDOCUMENT";
    }
    else
    {
      frameId = details.frameId;
      requestType = details.type.toUpperCase();
    }
    var frame = ext.getFrame(details.tabId, frameId);
    if (frame)
    {
      var results = ext.webRequest.onBeforeRequest._dispatch(new URL(details.url), requestType, new Page(
      {
        id: details.tabId
      }), frame);
      if (results.indexOf(true) !== -1)
      {
        return {"cancel" : true};
      }
    }
  },
  {
    urls: ["http://*/*", "https://*/*"]
  }, ["blocking"]);
  chrome.runtime.onMessage.addListener(function(message, rawSender, sendResponse)
  {
    var sender = {};
    if ("tab" in rawSender)
    {
      sender.page = new Page(rawSender.tab);
      sender.frame = {
        url: new URL(rawSender.url),
        get parent()
        {
          var frames = framesOfTabs[rawSender.tab.id];
          if (!frames)
          {
            return null;
          }
          if ("frameId" in rawSender)
          {
            var frame = frames[rawSender.frameId];
            if (frame)
            {
              return frame.parent;
            }
          }
          else
          {
            for (var frameId in frames)
            {
              if (frames[frameId].url.href == this.url.href)
              {
                return frames[frameId].parent;
              }
            }
          }
          return frames[0];
        }
      };
    }
    return ext.onMessage._dispatch(message, sender, sendResponse).indexOf(true) != -1;
  });
  chrome.runtime.onConnect.addListener(function()
  {});
  ext.storage = {
    get: function(keys, callback)
    {
      chrome.storage.local.get(keys, callback);
    },
    set: function(key, value, callback)
    {
      var items = {};
      items[key] = value;
      chrome.storage.local.set(items, callback);
    },
    remove: function(key, callback)
    {
      chrome.storage.local.remove(key, callback);
    },
    onChanged: chrome.storage.onChanged,
    migratePrefs: function(hooks)
    {
      var items = {};
      for (var key in localStorage)
      {
        var item = hooks.map(key, localStorage[key]);
        if (item)
        {
          items[item.key] = item.value;
        }
      }
      chrome.storage.local.set(items, function()
      {
        localStorage.clear();
        hooks.done();
      });
    },
    migrateFiles: function(callback)
    {
      if ("webkitRequestFileSystem" in window)
      {
        webkitRequestFileSystem(PERSISTENT, 0, function(fs)
        {
          fs.root.getFile("patterns.ini",
          {}, function(entry)
          {
            entry.getMetadata(function(metadata)
            {
              entry.file(function(file)
              {
                var reader = new FileReader();
                reader.onloadend = function()
                {
                  if (!reader.error)
                  {
                    chrome.storage.local.set(
                    {
                      "file:patterns.ini": {
                        content: reader.result.split(/[\r\n]+/),
                        lastModified: metadata.modificationTime.getTime()
                      }
                    }, function()
                    {
                      fs.root.createReader().readEntries(function(entries)
                      {
                        var emptyFunc = function()
                        {};
                        for (var i = 0; i < entries.length; i++)
                        {
                          var entry = entries[i];
                          if (entry.isDirectory)
                          {
                            entry.removeRecursively(emptyFunc, emptyFunc);
                          }
                          else
                          {
                            entry.remove(emptyFunc, emptyFunc);
                          }
                        }
                      });
                      callback();
                    });
                  }
                  else
                  {
                    callback();
                  }
                };
                reader.readAsText(file);
              }, callback);
            }, callback);
          }, callback);
        }, callback);
      }
      else
      {
        callback();
      }
    }
  };
  ext.showOptions = function(callback)
  {
    chrome.windows.getLastFocused(function(win)
    {
      var optionsUrl = chrome.extension.getURL("options/options.html");
      var queryInfo = {
        url: optionsUrl
      };
      if (!win.incognito)
      {
        queryInfo.windowId = win.id;
      }
      chrome.tabs.query(queryInfo, function(tabs)
      {
        if (tabs.length > 0)
        {
          var tab = tabs[0];
          chrome.windows.update(tab.windowId,
          {
            focused: true
          });
          chrome.tabs.update(tab.id,
          {
            active: true
          });
          if (callback)
          {
            callback(new Page(tab));
          }
        }
        else
        {
          ext.pages.open(optionsUrl, callback);
        }
      });
    });
  };
})();
