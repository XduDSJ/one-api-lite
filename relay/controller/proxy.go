// Package controller is a package for handling the relay controller
package controller

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/songquanpeng/one-api/common/logger"
	"github.com/songquanpeng/one-api/relay"
	"github.com/songquanpeng/one-api/relay/adaptor/openai"
	"github.com/songquanpeng/one-api/relay/meta"
	relaymodel "github.com/songquanpeng/one-api/relay/model"
)

// RelayProxyHelper is a helper function to proxy the request to the upstream service
func RelayProxyHelper(c *gin.Context, relayMode int) *relaymodel.ErrorWithStatusCode {
	ctx := c.Request.Context()
	meta := meta.GetByContext(c)

	adaptor := relay.GetAdaptor(meta.APIType)
	if adaptor == nil {
		return openai.ErrorWrapper(fmt.Errorf("invalid api type: %d", meta.APIType), "invalid_api_type", http.StatusBadRequest)
	}
	adaptor.Init(meta)

	resp, err := adaptor.DoRequest(c, meta, c.Request.Body)
	if err != nil {
		logger.Errorf(ctx, "DoRequest failed: %s", err.Error())
		return openai.ErrorWrapper(err, "do_request_failed", http.StatusInternalServerError)
	}

	// do response
	_, respErr := adaptor.DoResponse(c, resp, meta)
	if respErr != nil {
		logger.Errorf(ctx, "respErr is not nil: %+v", respErr)
		reportKeyResult(meta, respErr.StatusCode, 0, false)
		return respErr
	}

	// proxy 模式无法准确计量 token 数，传 0——IncrChannelKeyUsage 仍会自增
	// total_requests 和 avg_tokens_per_req，但 daily_used_quota 不增长，
	// 因此 DailyQuotaLimit 对 proxy 模式的 key 不会触发（已知限制）。
	reportKeyResult(meta, http.StatusOK, 0, true)
	return nil
}
