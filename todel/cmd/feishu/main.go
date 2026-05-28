package main

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	lark "github.com/larksuite/oapi-sdk-go/v3"
	larkcore "github.com/larksuite/oapi-sdk-go/v3/core"
	"github.com/larksuite/oapi-sdk-go/v3/event/dispatcher"
	larkim "github.com/larksuite/oapi-sdk-go/v3/service/im/v1"
	larkws "github.com/larksuite/oapi-sdk-go/v3/ws"
)

var appID = "cli_a91151e370785cc1"
var appSecret = "uQekVToEDM9SK5axKX90kgsTFHtBln3z"

var client = lark.NewClient(appID, appSecret)

func send(str string) {
	chatID := "oc_bfc7aa446d2516ee5cec552770281e96"

	timestamp := strconv.FormatInt(time.Now().Unix(), 10)
	str = str + "\n" + timestamp
	// 创建请求对象
	req := larkim.NewCreateMessageReqBuilder().
		ReceiveIdType(`chat_id`).
		Body(larkim.NewCreateMessageReqBodyBuilder().
			ReceiveId(chatID).
			MsgType(`post`).
			// Content(`{"zh_cn":{"content":[[{"tag":"md","text":"**加粗文本**\n*斜体文本*\n` + str + `"}]]}}`).
			Content(`{"zh_cn":{"content":[[{"tag":"md","text":"**加粗文本**\n*斜体文本*\n"}]]}}`).
			Build()).
		Build()

	// 发起请求
	resp, err := client.Im.V1.Message.Create(context.Background(), req)

	// 处理错误
	if err != nil {
		fmt.Println(err)
		return
	}

	// 服务端错误处理
	if !resp.Success() {
		fmt.Printf("logId: %s, error response: \n%s", resp.RequestId(), larkcore.Prettify(resp.CodeError))
		return
	}

	// 业务处理
	fmt.Println(larkcore.Prettify(resp))
}
func receive() {
	// 注册事件回调，接收群聊消息
	eventHandler := dispatcher.NewEventDispatcher("", "").
		OnP2MessageReceiveV1(func(ctx context.Context, event *larkim.P2MessageReceiveV1) error {
			// 打印接收到的完整事件数据
			fmt.Printf("[OnP2MessageReceiveV1] Received message: %s\n", larkcore.Prettify(event))

			// 检查是否为群聊消息
			if *event.Event.Message.ChatType == "group" {
				fmt.Printf("Received group message in chat_id: %s\n", *event.Event.Message.ChatId)
				fmt.Printf("Message content: %s\n", *event.Event.Message.Content)
				fmt.Printf("Sender open_id: %s\n", *event.Event.Sender.SenderId.OpenId)

				// 可以在这里添加处理群聊消息的业务逻辑
				// 例如：根据消息内容回复、调用其他API等
			}
			return nil
		})

	// 创建WebSocket客户端
	cli := larkws.NewClient(
		appID,
		appSecret,
		larkws.WithEventHandler(eventHandler),
		larkws.WithLogLevel(larkcore.LogLevelDebug),
	)

	// 启动客户端，开始监听事件
	fmt.Println("Starting WebSocket client to receive messages...")
	err := cli.Start(context.Background())
	if err != nil {
		fmt.Fprintf(os.Stderr, "ERROR: Failed to start WebSocket client: %s\n", err)
		panic(err)
	}

}

func main() {
	go func() {
		receive()
	}()

	scanner := bufio.NewScanner(os.Stdin)
	fmt.Println("请输入消息内容（输入 quit 退出）：")
	for scanner.Scan() {
		str := strings.TrimSpace(scanner.Text())
		if str == "quit" {
			break
		}
		if str != "" {
			send(str)
		}
	}
}
