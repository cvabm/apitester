package main

import "testing"

const sampleOpenAPI = `{
  "openapi": "3.0.3",
  "info": {"title": "商店", "version": "1.0.0"},
  "servers": [{"url": "https://shop.example/v1"}],
  "components": {
    "securitySchemes": {
      "token": {"type": "http", "scheme": "bearer"}
    },
    "schemas": {
      "User": {"type": "object", "example": {"id": 7, "name": "ada"}}
    }
  },
  "security": [{"token": []}],
  "paths": {
    "/users/{id}": {
      "get": {
        "tags": ["用户"],
        "summary": "读取用户",
        "parameters": [
          {"name": "id", "in": "path", "required": true},
          {"name": "verbose", "in": "query", "schema": {"type": "string", "example": "yes"}},
          {"name": "X-Trace", "in": "header", "schema": {"type": "string", "example": "abc"}}
        ],
        "responses": {
          "200": {
            "description": "ok",
            "content": {
              "application/json": {"schema": {"$ref": "#/components/schemas/User"}}
            }
          }
        }
      }
    },
    "/users": {
      "post": {
        "summary": "创建用户",
        "requestBody": {
          "content": {
            "application/json": {"example": {"name": "ada"}}
          }
        },
        "responses": {"201": {"description": "created", "content": {"application/json": {"example": {"id": 1}}}}}
      }
    }
  }
}`

func TestParseOpenAPI(t *testing.T) {
	if !isOpenAPIDocument([]byte(sampleOpenAPI)) {
		t.Fatal("openapi should detect")
	}
	if isOpenAPIDocument([]byte(`{"info":{"name":"x"},"item":[]}`)) {
		t.Fatal("postman should not detect as openapi")
	}
	p, err := parseImportFile([]byte(sampleOpenAPI))
	if err != nil {
		t.Fatal(err)
	}
	if p.Project != "商店" {
		t.Fatalf("project=%q", p.Project)
	}
	if len(p.Environments) != 1 || p.Environments[0].Variables[0].Value != "https://shop.example/v1" {
		t.Fatalf("env=%#v", p.Environments)
	}
	if len(p.Requests) != 2 {
		t.Fatalf("requests=%d", len(p.Requests))
	}
	get := findRequest(p.Requests, "GET")
	if get.Method != "GET" || get.URL != "https://shop.example/v1/users/{id}?verbose=yes" {
		t.Fatalf("get url=%q method=%q", get.URL, get.Method)
	}
	if get.Title != "读取用户" || get.Module != "用户" || get.AuthType != "bearer" {
		t.Fatalf("get meta title=%q module=%q auth=%q", get.Title, get.Module, get.AuthType)
	}
	if get.Example != `{"id":7,"name":"ada"}` {
		t.Fatalf("example=%q", get.Example)
	}
	if len(get.HeaderList) != 1 || get.HeaderList[0].Key != "X-Trace" || get.HeaderList[0].Value != "abc" {
		t.Fatalf("headers=%#v", get.HeaderList)
	}
	post := findRequest(p.Requests, "POST")
	if post.BodyType != "json" || post.Body != `{"name":"ada"}` || post.Example != `{"id":1}` {
		t.Fatalf("post body=%q example=%q type=%q", post.Body, post.Example, post.BodyType)
	}
}

func TestParseSwaggerYAML(t *testing.T) {
	raw := []byte("swagger: '2.0'\ninfo:\n  title: 旧文档\nhost: shop.example\nbasePath: /v1\nschemes: [https]\npaths:\n  /ping:\n    get:\n      responses:\n        '200':\n          description: ok\n          schema:\n            example:\n              ok: true\n")
	p, err := parseOpenAPIDocument(raw)
	if err != nil {
		t.Fatal(err)
	}
	if p.Project != "旧文档" || len(p.Requests) != 1 {
		t.Fatalf("project=%q n=%d", p.Project, len(p.Requests))
	}
	if p.Requests[0].URL != "https://shop.example/v1/ping" || p.Requests[0].Example != `{"ok":true}` {
		t.Fatalf("url=%q example=%q", p.Requests[0].URL, p.Requests[0].Example)
	}
}

func findRequest(reqs []SavedRequest, method string) SavedRequest {
	for _, req := range reqs {
		if req.Method == method {
			return req
		}
	}
	return SavedRequest{}
}
