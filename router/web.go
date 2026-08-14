package router

import (
	"embed"
	"fmt"
	"github.com/gin-contrib/gzip"
	"github.com/gin-contrib/static"
	"github.com/gin-gonic/gin"
	"github.com/songquanpeng/one-api/common"
	"github.com/songquanpeng/one-api/common/config"
	"github.com/songquanpeng/one-api/controller"
	"github.com/songquanpeng/one-api/middleware"
	"net/http"
	"strings"
)

func SetWebRouter(router *gin.Engine, buildFS embed.FS) {
	themePath := fmt.Sprintf("web/build/%s", config.Theme)
	indexPageData, err := buildFS.ReadFile(fmt.Sprintf("%s/index.html", themePath))
	if err != nil {
		// 主题不存在时回退到 aurora（避免白屏）
		themePath = "web/build/aurora"
		indexPageData, _ = buildFS.ReadFile(fmt.Sprintf("%s/index.html", themePath))
	}
	router.Use(gzip.Gzip(gzip.DefaultCompression))
	router.Use(middleware.GlobalWebRateLimit())
	router.Use(middleware.Cache())
	router.Use(static.Serve("/", common.EmbedFolder(buildFS, themePath)))
	router.NoRoute(func(c *gin.Context) {
		if strings.HasPrefix(c.Request.RequestURI, "/v1") || strings.HasPrefix(c.Request.RequestURI, "/api") {
			controller.RelayNotFound(c)
			return
		}
		c.Header("Cache-Control", "no-cache")
		c.Data(http.StatusOK, "text/html; charset=utf-8", indexPageData)
	})
}
