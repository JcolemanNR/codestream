package com.codestream.webview

import com.codestream.ENV_DISABLE_JCEF
import com.codestream.WEBVIEW_PATH
import com.codestream.agentService
import com.codestream.gson
import com.codestream.protocols.agent.TelemetryParams
import com.codestream.protocols.webview.WebViewNotification
import com.codestream.sessionService
import com.codestream.settings.ApplicationSettingsService
import com.codestream.settingsService
import com.codestream.system.Platform
import com.codestream.system.platform
import com.github.salomonbrys.kotson.jsonObject
import com.google.gson.JsonElement
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.intellij.ui.jcef.JBCefApp
import com.intellij.ui.jcef.JBCefBrowser
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.future.await
import kotlinx.coroutines.launch
import org.apache.commons.io.FileUtils
import org.eclipse.lsp4j.jsonrpc.messages.ResponseError
import java.io.File
import java.nio.charset.Charset
import java.util.concurrent.CompletableFuture
import javax.swing.UIManager

class WebViewService(val project: Project) : Disposable {
    private val utf8 = Charset.forName("UTF-8")
    private val logger = Logger.getInstance(WebViewService::class.java)
    private val router = WebViewRouter(project)
    private val webViewCreation = CompletableFuture<Unit>()
    private lateinit var tempDir: File
    private lateinit var extractedHtmlFile: File

    lateinit var webView: WebView

    private val htmlFile: File get() = if (WEBVIEW_PATH != null) {
        File(WEBVIEW_PATH,"webview.html")
    } else {
        extractedHtmlFile
    }

    init {
        logger.info("Initializing WebViewService for project ${project.basePath}")
        ApplicationManager.getApplication().invokeLater {
            webView = createWebView(router)
            webViewCreation.complete(Unit)
        }

        extractAssets()
        applyStylesheet()

        UIManager.addPropertyChangeListener {
            if (it.propertyName == "lookAndFeel") {
                applyStylesheet()
                webView.loadUrl(htmlFile.url)
            }
        }
    }

    fun onDidCreateWebview(cb: () -> Unit) {
        if (webViewCreation.isDone) cb()
        else webViewCreation.thenRun(cb)
    }

    fun onDidInitialize(cb: () -> Unit) {
        if (router.initialization.isDone) cb()
        else router.initialization.thenRun(cb)
    }

    fun load(resetContext: Boolean = false) {
        logger.info("Loading WebView")
        if (resetContext) {
            project.settingsService?.clearWebViewContext()
        }
        applyStylesheet()
        ApplicationManager.getApplication().invokeLater {
            GlobalScope.launch {
                try {
                    webViewCreation.await()
                    webView.loadUrl(htmlFile.url)
                } catch (e: Exception) {
                    logger.error(e)
                }
            }
        }
    }

    fun openDevTools() {
        webView.openDevTools()
    }

    private fun extractAssets() {
        tempDir = createTempDir("codestream")
        logger.info("Extracting webview to ${tempDir.absolutePath}")
        tempDir.deleteOnExit()
        extractedHtmlFile = File(tempDir, "webview.html")

        FileUtils.copyToFile(javaClass.getResourceAsStream("/webview/webview.js"), File(tempDir, "webview.js"))
        FileUtils.copyToFile(
            javaClass.getResourceAsStream("/webview/webview-data.js"),
            File(tempDir, "webview-data.js")
        )
        FileUtils.copyToFile(javaClass.getResourceAsStream("/webview/webview.css"), File(tempDir, "webview.css"))
        FileUtils.copyToFile(javaClass.getResourceAsStream("/webview/webview.html"), File(tempDir, "webview.html"))
    }

    private fun applyStylesheet() {
        val theme = WebViewTheme.build()
        val htmlContent = FileUtils.readFileToString(htmlFile, utf8)
            .replace("{bodyClass}", theme.name)
            .replace("<style id=\"theme\"></style>", "<style id=\"theme\">${theme.stylesheet}</style>")
        FileUtils.write(htmlFile, htmlContent, utf8)
    }

    fun postResponse(id: String, params: Any?, error: String? = null, responseError: ResponseError? = null) {
        val message = if (responseError != null) {
            jsonObject(
                "id" to id,
                "params" to gson.toJsonTree(params),
                "error" to gson.toJsonTree(responseError)
            )
        } else {
            jsonObject(
                "id" to id,
                "params" to gson.toJsonTree(params),
                "error" to error
            )
        }

        postMessage(message, true)
    }

    fun postNotification(notification: WebViewNotification, force: Boolean? = false) {
        logger.debug("Posting ${notification.getMethod()}")
        val message = jsonObject(
            "method" to notification.getMethod(),
            "params" to gson.toJsonTree(notification)
        )
        postMessage(message, force)
    }

    fun postNotification(method: String, params: Any?, force: Boolean? = false) {
        logger.debug("Posting $method")
        val message = jsonObject(
            "method" to method,
            "params" to gson.toJsonTree(params)
        )
        postMessage(message, force)
    }

    private fun postMessage(message: JsonElement, force: Boolean? = false) {
        if (router.isReady || force == true) webView.postMessage(message)
    }

    override fun dispose() {
        webView.dispose()
    }

    private fun createWebView(router: WebViewRouter): WebView {
        val appSettings = ServiceManager.getService(ApplicationSettingsService::class.java)
        return try {
            if (!ENV_DISABLE_JCEF && appSettings.jcef && JBCefApp.isSupported() && platform != Platform.LINUX) {
                logger.info("JCEF enabled")
                val jbCefBrowser = JBCefBrowser()
                JBCefWebView(jbCefBrowser, router).also {
                    webviewTelemetry("JCEF")
                }
            } else {
                logger.info("JCEF disabled - falling back to JxBrowser")
                val engine = ServiceManager.getService(JxBrowserEngineService::class.java)
                JxBrowserWebView(engine.newBrowser(), router).also {
                    if (JBCefApp.isSupported()) {
                        webviewTelemetry("JxBrowser - user selection")
                    } else {
                        webviewTelemetry("JxBrowser - JCEF not supported")
                    }
                }

            }
        } catch (ex: Exception) {
            logger.warn("Error initializing JCEF - falling back to JxBrowser", ex)
            val engine = ServiceManager.getService(JxBrowserEngineService::class.java)
            JxBrowserWebView(engine.newBrowser(), router).also {
                webviewTelemetry("JxBrowser - JCEF failed")
            }
        }
    }

    private fun webviewTelemetry(webviewType: String) {
        val params = TelemetryParams("JB Webview Created", mapOf("Webview" to webviewType))
        if (project.sessionService?.userLoggedIn != null) {
            project.agentService?.agent?.telemetry(params)
        } else {
            project.sessionService?.onUserLoggedInChanged {
                if (it != null) {
                    project.agentService?.agent?.telemetry(params)
                }
            }
        }
    }

}

private val File.url: String
    get() = toURI().toURL().toString()
