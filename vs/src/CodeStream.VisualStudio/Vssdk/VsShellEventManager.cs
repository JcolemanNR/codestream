﻿using System;
using CodeStream.VisualStudio.Vssdk.Events;
using Microsoft.VisualStudio;
using Microsoft.VisualStudio.PlatformUI;
using Microsoft.VisualStudio.Shell;
using Microsoft.VisualStudio.Shell.Interop;

namespace CodeStream.VisualStudio.Vssdk
{
    public class VsShellEventManager : IVsSelectionEvents, IDisposable
    {
        private readonly IVsMonitorSelection _iVsMonitorSelection;
        private readonly uint _monitorSelectionCookie;

        public VsShellEventManager(IVsMonitorSelection iVsMonitorSelection)
        {
            ThreadHelper.ThrowIfNotOnUIThread();

            _iVsMonitorSelection = iVsMonitorSelection;            

            _iVsMonitorSelection.AdviseSelectionEvents(this, out uint pdwCookie);
            _monitorSelectionCookie = pdwCookie;

            VSColorTheme.ThemeChanged += VSColorTheme_ThemeChanged;
        }

        private void VSColorTheme_ThemeChanged(ThemeChangedEventArgs e)
        {
            ThemeChanged?.Invoke(this, e);
        }

        public event EventHandler<WindowFocusChangedEventArgs> WindowFocusChanged;
        public event EventHandler<ThemeChangedEventArgs> ThemeChanged;

        public int OnSelectionChanged(IVsHierarchy pHierarchyOld, uint itemIdOld, IVsMultiItemSelect pMisOld, ISelectionContainer pScOld, IVsHierarchy pHierNew, uint itemidNew, IVsMultiItemSelect pMisNew, ISelectionContainer pScNew)
        {
            return VSConstants.S_OK;
        }

        public int OnElementValueChanged(uint elementid, object varValueOld, object varValueNew)
        {
            ThreadHelper.ThrowIfNotOnUIThread();

            if (elementid == (uint)VSConstants.VSSELELEMID.SEID_WindowFrame)
            {
                if (varValueNew is IVsWindowFrame windowFrame)
                {
                    var fileInfo = GetFileInfo(windowFrame);
                    if (fileInfo != null)
                    {
                        WindowFocusChanged?.Invoke(this, new WindowFocusChangedEventArgs(fileInfo.FileName, fileInfo.Uri));
                    }
                }
            }

            return VSConstants.S_OK;
        }

        private FileInfo GetFileInfo(IVsWindowFrame windowFrame)
        {
            if (windowFrame == null) return null;

            ThreadHelper.ThrowIfNotOnUIThread();

            object value;
            if (windowFrame.GetProperty((int)__VSFPROPID.VSFPROPID_pszMkDocument, out value) != VSConstants.S_OK) return null;

            var filename = value as string;
            if (filename == null) return null;

            var fileInfo = new FileInfo { FileName = filename };
            try
            {
                fileInfo.Uri = new Uri(filename);
            }
            catch (Exception)
            {
                // numerous exceptions could occur here since the moniker property of the frame doesn't have
                // to be in the URI format. There could also be security exceptions, FNF exceptions, etc.
            }

            return fileInfo;

        }

        public int OnCmdUIContextChanged(uint dwCmdUiCookie, int fActive)
        {
            return VSConstants.S_OK;
        }

        private bool _disposedValue;

        protected virtual void Dispose(bool disposing)
        {            
            System.Windows.Threading.Dispatcher.CurrentDispatcher.VerifyAccess();

            if (!_disposedValue)
            {              
                if (disposing)
                {                    
                    _iVsMonitorSelection?.UnadviseSelectionEvents(_monitorSelectionCookie);
                    VSColorTheme.ThemeChanged -= VSColorTheme_ThemeChanged;
                }

                _disposedValue = true;
            }
        }

        public void Dispose()
        {
            Dispose(true);
        }

        private class FileInfo
        {
            public Uri Uri { get; set; }
            public string FileName { get; set; }
        }
    }
}