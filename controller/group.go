package controller

import (
	"github.com/gin-gonic/gin"
	"net/http"
)

func GetGroups(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    []string{"default"},
	})
}
