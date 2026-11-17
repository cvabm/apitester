package main

// HeaderItem is one editable request header or form/query row.
type HeaderItem struct {
	Key     string `json:"key"`
	Value   string `json:"value"`
	Enabled bool   `json:"enabled"`
}

// Environment is a named variable set on one host profile.
type Environment struct {
	Name      string       `json:"name"`
	Variables []HeaderItem `json:"variables,omitempty"`
}

// Profile is a named connection preset (one per scheme://host[:port]).
type Profile struct {
	Name string `json:"name"`
	URL  string `json:"url"`
	// Project groups hosts that share one catalog (ApiZza / Postman collection name).
	Project      string            `json:"project,omitempty"`
	Protocol     string            `json:"protocol"`
	Method       string            `json:"method,omitempty"`
	Headers      map[string]string `json:"headers"`
	HeaderList   []HeaderItem      `json:"headerList,omitempty"`
	AuthType     string            `json:"authType,omitempty"`
	AuthToken    string            `json:"authToken,omitempty"`
	AuthUser     string            `json:"authUser,omitempty"`
	AuthPass     string            `json:"authPass,omitempty"`
	BodyType     string            `json:"bodyType,omitempty"`
	Body         string            `json:"body,omitempty"`
	FormList     []HeaderItem      `json:"formList,omitempty"`
	VariableList []HeaderItem      `json:"variableList,omitempty"`
	// ActiveEnv is the name of the environment currently used for {{vars}}.
	ActiveEnv string `json:"activeEnv,omitempty"`
	// Environments are named variable sets on this host. VariableList mirrors the active one.
	Environments []Environment `json:"environments,omitempty"`
	Reconnect    bool          `json:"reconnect"`
	PingSec      int           `json:"pingSec"`
	// NoFollowRedirects keeps HTTP 3xx as the response (API-tester default is to follow).
	NoFollowRedirects bool `json:"noFollowRedirects,omitempty"`
	// InsecureSkipVerify is an explicit opt-in for lab/self-signed certificates.
	InsecureSkipVerify bool `json:"insecureSkipVerify,omitempty"`
	// Requests are named snapshots under this host. Variables stay on the profile.
	Requests []SavedRequest `json:"requests,omitempty"`
	// Modules are named folders in the per-host catalog. Empty folders stay here.
	Modules []string `json:"modules,omitempty"`
}

// SavedRequest is a named request bookmark on one host profile.
type SavedRequest struct {
	ID          string       `json:"id"`
	Name        string       `json:"name"`
	Title       string       `json:"title,omitempty"`
	Description string       `json:"description,omitempty"`
	Module      string       `json:"module,omitempty"`
	UpdatedAt   int64        `json:"updatedAt,omitempty"`
	Kind        string       `json:"kind,omitempty"` // http | ws
	URL         string       `json:"url"`
	Method      string       `json:"method,omitempty"`
	Protocol    string       `json:"protocol,omitempty"`
	HeaderList  []HeaderItem `json:"headerList,omitempty"`
	AuthType    string       `json:"authType,omitempty"`
	AuthToken   string       `json:"authToken,omitempty"`
	AuthUser    string       `json:"authUser,omitempty"`
	AuthPass    string       `json:"authPass,omitempty"`
	BodyType    string       `json:"bodyType,omitempty"`
	Body        string       `json:"body,omitempty"`
	FormList    []HeaderItem `json:"formList,omitempty"`
	// Example is a recorded response / return body, not sent.
	Example string `json:"example,omitempty"`
}

// ConnectOptions is used by the UI to open a connection.
type ConnectOptions struct {
	URL                string            `json:"url"`
	Protocol           string            `json:"protocol"`
	Method             string            `json:"method,omitempty"`
	Headers            map[string]string `json:"headers"`
	Reconnect          bool              `json:"reconnect"`
	PingSec            int               `json:"pingSec"`
	NoFollowRedirects  bool              `json:"noFollowRedirects,omitempty"`
	InsecureSkipVerify bool              `json:"insecureSkipVerify,omitempty"`
}

// Msg is a single logged frame (in/out/sys).
type Msg struct {
	ID       int64         `json:"id"`
	Dir      string        `json:"dir"` // in | out | sys
	Time     string        `json:"time"`
	Text     string        `json:"text"`
	Pretty   string        `json:"pretty"`
	Bytes    int           `json:"bytes"`
	Exchange *HTTPExchange `json:"exchange,omitempty"`
	WS       *WSRecord     `json:"ws,omitempty"`
	Profile  string        `json:"profile,omitempty"`
	// Slim means bodies were clipped for the list; call LoadSessionMessage for the full row.
	Slim bool `json:"slim,omitempty"`
}

// WSRecord is a manually saved WebSocket send/receive pair.
type WSRecord struct {
	URL      string `json:"url"`
	Protocol string `json:"protocol,omitempty"`
	Out      string `json:"out"`
	In       string `json:"in"`
	Manual   bool   `json:"manual,omitempty"`
}

// HTTPExchange is one HTTP/HTTPS request/response pair.
type HTTPExchange struct {
	Method             string            `json:"method"`
	URL                string            `json:"url"`
	Status             string            `json:"status"`
	StatusCode         int               `json:"statusCode"`
	TimeMs             int64             `json:"timeMs"`
	Bytes              int               `json:"bytes"`
	Truncated          bool              `json:"truncated"`
	ReqHeaders         map[string]string `json:"reqHeaders"`
	ResHeaders         map[string]string `json:"resHeaders"`
	ReqBody            string            `json:"reqBody"`
	ResBody            string            `json:"resBody"`
	// ResImage is a data URL when the response body is an image. The raw bytes
	// are not placed in ResBody, because JSON would turn them into text.
	ResImage string `json:"resImage,omitempty"`
	Error              string            `json:"error,omitempty"`
	Manual             bool              `json:"manual,omitempty"`
	InsecureSkipVerify bool              `json:"insecureSkipVerify,omitempty"`
}

// Status is the live connection snapshot for the UI.
type Status struct {
	State    string `json:"state"` // idle | connecting | open | closed | reconnecting
	Kind     string `json:"kind"`  // ws | http
	URL      string `json:"url"`
	Protocol string `json:"protocol"`
	Method   string `json:"method,omitempty"`
	Session  string `json:"session"`
	MsgCount int    `json:"msgCount"`
	Error    string `json:"error,omitempty"`
	Profile  string `json:"profile,omitempty"`
}
