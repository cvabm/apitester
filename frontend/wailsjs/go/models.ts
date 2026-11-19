export namespace main {
	
	export class ConnectOptions {
	    url: string;
	    protocol: string;
	    method?: string;
	    headers: Record<string, string>;
	    reconnect: boolean;
	    pingSec: number;
	    noFollowRedirects?: boolean;
	    insecureSkipVerify?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ConnectOptions(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.url = source["url"];
	        this.protocol = source["protocol"];
	        this.method = source["method"];
	        this.headers = source["headers"];
	        this.reconnect = source["reconnect"];
	        this.pingSec = source["pingSec"];
	        this.noFollowRedirects = source["noFollowRedirects"];
	        this.insecureSkipVerify = source["insecureSkipVerify"];
	    }
	}
	export class SavedRequest {
	    id: string;
	    name: string;
	    title?: string;
	    description?: string;
	    module?: string;
	    updatedAt?: number;
	    kind?: string;
	    url: string;
	    method?: string;
	    protocol?: string;
	    headerList?: HeaderItem[];
	    authType?: string;
	    authToken?: string;
	    authUser?: string;
	    authPass?: string;
	    bodyType?: string;
	    body?: string;
	    formList?: HeaderItem[];
	    example?: string;
	
	    static createFrom(source: any = {}) {
	        return new SavedRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.title = source["title"];
	        this.description = source["description"];
	        this.module = source["module"];
	        this.updatedAt = source["updatedAt"];
	        this.kind = source["kind"];
	        this.url = source["url"];
	        this.method = source["method"];
	        this.protocol = source["protocol"];
	        this.headerList = this.convertValues(source["headerList"], HeaderItem);
	        this.authType = source["authType"];
	        this.authToken = source["authToken"];
	        this.authUser = source["authUser"];
	        this.authPass = source["authPass"];
	        this.bodyType = source["bodyType"];
	        this.body = source["body"];
	        this.formList = this.convertValues(source["formList"], HeaderItem);
	        this.example = source["example"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Environment {
	    name: string;
	    variables?: HeaderItem[];
	
	    static createFrom(source: any = {}) {
	        return new Environment(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.variables = this.convertValues(source["variables"], HeaderItem);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class HeaderItem {
	    key: string;
	    value: string;
	    enabled: boolean;
	
	    static createFrom(source: any = {}) {
	        return new HeaderItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.key = source["key"];
	        this.value = source["value"];
	        this.enabled = source["enabled"];
	    }
	}
	export class Profile {
	    name: string;
	    url: string;
	    project?: string;
	    protocol: string;
	    method?: string;
	    headers: Record<string, string>;
	    headerList?: HeaderItem[];
	    authType?: string;
	    authToken?: string;
	    authUser?: string;
	    authPass?: string;
	    bodyType?: string;
	    body?: string;
	    formList?: HeaderItem[];
	    variableList?: HeaderItem[];
	    activeEnv?: string;
	    environments?: Environment[];
	    reconnect: boolean;
	    pingSec: number;
	    noFollowRedirects?: boolean;
	    insecureSkipVerify?: boolean;
	    requests?: SavedRequest[];
	    modules?: string[];
	
	    static createFrom(source: any = {}) {
	        return new Profile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.url = source["url"];
	        this.project = source["project"];
	        this.protocol = source["protocol"];
	        this.method = source["method"];
	        this.headers = source["headers"];
	        this.headerList = this.convertValues(source["headerList"], HeaderItem);
	        this.authType = source["authType"];
	        this.authToken = source["authToken"];
	        this.authUser = source["authUser"];
	        this.authPass = source["authPass"];
	        this.bodyType = source["bodyType"];
	        this.body = source["body"];
	        this.formList = this.convertValues(source["formList"], HeaderItem);
	        this.variableList = this.convertValues(source["variableList"], HeaderItem);
	        this.activeEnv = source["activeEnv"];
	        this.environments = this.convertValues(source["environments"], Environment);
	        this.reconnect = source["reconnect"];
	        this.pingSec = source["pingSec"];
	        this.noFollowRedirects = source["noFollowRedirects"];
	        this.insecureSkipVerify = source["insecureSkipVerify"];
	        this.requests = this.convertValues(source["requests"], SavedRequest);
	        this.modules = source["modules"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class CurlImport {
	    profile: Profile;
	    requestId: string;
	    warnings?: string[];
	
	    static createFrom(source: any = {}) {
	        return new CurlImport(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.profile = this.convertValues(source["profile"], Profile);
	        this.requestId = source["requestId"];
	        this.warnings = source["warnings"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class HTTPExchange {
	    method: string;
	    url: string;
	    status: string;
	    statusCode: number;
	    timeMs: number;
	    bytes: number;
	    truncated: boolean;
	    reqHeaders: Record<string, string>;
	    resHeaders: Record<string, string>;
	    reqBody: string;
	    resBody: string;
	    resImage?: string;
	    resData?: string;
	    error?: string;
	    manual?: boolean;
	    insecureSkipVerify?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new HTTPExchange(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.method = source["method"];
	        this.url = source["url"];
	        this.status = source["status"];
	        this.statusCode = source["statusCode"];
	        this.timeMs = source["timeMs"];
	        this.bytes = source["bytes"];
	        this.truncated = source["truncated"];
	        this.reqHeaders = source["reqHeaders"];
	        this.resHeaders = source["resHeaders"];
	        this.reqBody = source["reqBody"];
	        this.resBody = source["resBody"];
	        this.resImage = source["resImage"];
	        this.resData = source["resData"];
	        this.error = source["error"];
	        this.manual = source["manual"];
	        this.insecureSkipVerify = source["insecureSkipVerify"];
	    }
	}
	
	export class WSRecord {
	    url: string;
	    protocol?: string;
	    out: string;
	    in: string;
	    manual?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new WSRecord(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.url = source["url"];
	        this.protocol = source["protocol"];
	        this.out = source["out"];
	        this.in = source["in"];
	        this.manual = source["manual"];
	    }
	}
	export class Msg {
	    id: number;
	    dir: string;
	    time: string;
	    text: string;
	    pretty: string;
	    data?: string;
	    bytes: number;
	    exchange?: HTTPExchange;
	    ws?: WSRecord;
	    profile?: string;
	    slim?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Msg(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.dir = source["dir"];
	        this.time = source["time"];
	        this.text = source["text"];
	        this.pretty = source["pretty"];
	        this.data = source["data"];
	        this.bytes = source["bytes"];
	        this.exchange = this.convertValues(source["exchange"], HTTPExchange);
	        this.ws = this.convertValues(source["ws"], WSRecord);
	        this.profile = source["profile"];
	        this.slim = source["slim"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	export class SessionInfo {
	    name: string;
	    path: string;
	    size: number;
	    modTime: string;
	    url?: string;
	    host?: string;
	    day?: string;
	    matchCount?: number;
	    matchHint?: string;
	
	    static createFrom(source: any = {}) {
	        return new SessionInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.path = source["path"];
	        this.size = source["size"];
	        this.modTime = source["modTime"];
	        this.url = source["url"];
	        this.host = source["host"];
	        this.day = source["day"];
	        this.matchCount = source["matchCount"];
	        this.matchHint = source["matchHint"];
	    }
	}
	export class SessionDetail {
	    info: SessionInfo;
	    url: string;
	    protocol: string;
	    messages: Msg[];
	    notes: string[];
	
	    static createFrom(source: any = {}) {
	        return new SessionDetail(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.info = this.convertValues(source["info"], SessionInfo);
	        this.url = source["url"];
	        this.protocol = source["protocol"];
	        this.messages = this.convertValues(source["messages"], Msg);
	        this.notes = source["notes"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class Status {
	    state: string;
	    kind: string;
	    url: string;
	    protocol: string;
	    method?: string;
	    session: string;
	    msgCount: number;
	    error?: string;
	    profile?: string;
	
	    static createFrom(source: any = {}) {
	        return new Status(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.state = source["state"];
	        this.kind = source["kind"];
	        this.url = source["url"];
	        this.protocol = source["protocol"];
	        this.method = source["method"];
	        this.session = source["session"];
	        this.msgCount = source["msgCount"];
	        this.error = source["error"];
	        this.profile = source["profile"];
	    }
	}

}

