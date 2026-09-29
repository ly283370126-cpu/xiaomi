wit_bindgen::generate!({path:"wit",world:"plugin",generate_all});
use exports::astrobox::psys_plugin::{event,lifecycle};
use astrobox::psys_host::{device,dialog,interconnect,register,timer,ui};
use serde::{Deserialize,Serialize};
use std::sync::{Mutex,OnceLock};
use std::time::{Duration,SystemTime,UNIX_EPOCH};
use wit_bindgen::FutureReader;
const PKG:&str="io.github.ly283370126.codexwatch";
#[derive(Clone,Default,Deserialize,Serialize)]
#[serde(rename_all="camelCase")]
struct Config { repository:String, branch:String, token:String, device_addr:String }
#[derive(Deserialize,Serialize)]
#[serde(rename_all="camelCase")]
struct Window {used_percent:f64,remaining_percent:f64,resets_at:f64}
#[derive(Deserialize,Serialize)]
#[serde(rename_all="camelCase")]
struct Snapshot {schema_version:u32,provider:String,collected_at:u64,five_hour:Option<Window>,weekly:Option<Window>}
#[derive(Default)]
struct State {config:Config,status:String,last_attempt:u64}
static STATE:OnceLock<Mutex<State>>=OnceLock::new();
fn state()->std::sync::MutexGuard<'static,State>{STATE.get_or_init(||Mutex::new(State::default())).lock().unwrap()}
fn text_future(s:String)->FutureReader<String>{let(w,r)=wit_future::new(String::new);wit_bindgen::spawn(async move{let _=w.write(s).await;});r}
fn unit_future()->FutureReader<()>{let(w,r)=wit_future::new(||());wit_bindgen::spawn(async move{let _=w.write(()).await;});r}
fn config_valid(c:&Config)->bool{
 c.repository.split('/').count()==2 && c.repository.split('/').all(|p|!p.is_empty()&&p.chars().all(|x|x.is_ascii_alphanumeric()||"._-".contains(x))) && !c.branch.is_empty() && c.branch.chars().all(|x|x.is_ascii_alphanumeric()||"._-/".contains(x))
}
async fn sync()->Result<(),String>{
 let c=state().config.clone();if !config_valid(&c){return Err("请导入配置文件".into())}
 let devices=device::get_connected_device_list().await;
 let selected=if c.device_addr.is_empty(){if devices.len()!=1{return Err("请连接一台设备，或在配置中指定 deviceAddr".into())}devices.first()}else{devices.iter().find(|d|d.addr==c.device_addr)};
 let d=selected.ok_or("目标手表未连接")?;
 register::register_interconnect_recv(&d.addr,PKG).await.map_err(|_|"互联注册失败")?;
 // The repository is public. Read the raw file directly so the watch plugin
 // does not depend on GitHub API rate limits or a write-capable token.
 let url=format!("https://raw.githubusercontent.com/{}/{}/usage.json",c.repository,c.branch);
 let request=waki::Client::new().get(&url).header("User-Agent","codex-watch").connect_timeout(Duration::from_secs(15));
 let response=request.send().map_err(|_|"GitHub 网络请求失败")?;
 if response.status_code()!=200{return Err(format!("GitHub HTTP {}",response.status_code()))}
 let bytes=response.body().map_err(|_|"无法读取快照")?;
 if bytes.len()>8192{return Err("快照过大".into())}
 let s:Snapshot=serde_json::from_slice(&bytes).map_err(|_|"快照格式不正确")?;
 if s.schema_version!=1||s.provider!="codex"||s.collected_at==0{return Err("快照版本或来源不正确".into())}
 for w in [&s.five_hour,&s.weekly].into_iter().flatten(){if !(0.0..=100.0).contains(&w.remaining_percent)||!(0.0..=100.0).contains(&w.used_percent)||(w.remaining_percent+w.used_percent-100.0).abs()>0.01||w.resets_at<=0.0{return Err("额度数据不正确".into())}}
 let data=serde_json::to_string(&s).map_err(|_|"快照编码失败")?;
 interconnect::send_qaic_message(&d.addr,PKG,&data).await.map_err(|_|"蓝牙发送失败")?;
 Ok(())
}
async fn refresh(){
 let now=SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
 {let mut s=state();if now.saturating_sub(s.last_attempt)<5{return}s.last_attempt=now;}
 let result=sync().await;
 state().status=match result{Ok(())=>"已发送；请在手表确认显示".into(),Err(e)=>e};
}
struct Plugin;
impl lifecycle::Guest for Plugin{
 fn on_load(){
  if let Ok(b)=std::fs::read("config.json"){if let Ok(c)=serde_json::from_slice::<Config>(&b){state().config=c;}}
  state().status="打开页面导入配置，然后同步".into();
  wit_bindgen::block_on(async{timer::set_interval(60000,"quota").await;});
 }
}
impl event::Guest for Plugin{
 fn on_event(t:event::EventType,_payload:String)->FutureReader<String>{if matches!(t,event::EventType::Timer|event::EventType::InterconnectMessage){wit_bindgen::block_on(refresh());}text_future(String::new())}
 fn on_ui_event(id:String,_event:event::Event,_payload:String)->FutureReader<String>{
  wit_bindgen::block_on(async{
   if id=="configure"{
    let f=dialog::pick_file(&dialog::PickConfig{read:true,copy_to:None},&dialog::FilterConfig{multiple:false,extensions:vec!["json".into()],default_directory:String::new(),default_file_name:String::new()}).await;
    match serde_json::from_slice::<Config>(&f.data){
     Ok(c) if config_valid(&c)=>{let bytes=serde_json::to_vec(&c).unwrap();if std::fs::write("config.json",bytes).is_ok(){state().config=c;state().status="配置已保存，点击同步".into();}else{state().status="配置存储失败".into();}},
     _=>{state().status="配置无效；未保存".into();}
    }
   }else if id=="refresh"{refresh().await;}
  });text_future(String::new())
 }
 fn on_ui_render(id:String)->FutureReader<()>{
  // Do not borrow through the MutexGuard while calling host UI APIs. AstroBox
  // may synchronously re-enter the plugin during render; keeping the guard
  // alive across that call causes the WASM event loop deadlock trap.
  let status=state().status.clone();
  let root=ui::Element::new(ui::ElementType::Div,None)
   .child(ui::Element::new(ui::ElementType::P,Some("Codex Watch · 实验版")))
   .child(ui::Element::new(ui::ElementType::P,Some(&status)))
   .child(ui::Element::new(ui::ElementType::Button,Some("导入配置 JSON")).on(ui::Event::Click,"configure"))
   .child(ui::Element::new(ui::ElementType::Button,Some("同步额度")).on(ui::Event::Click,"refresh"));
  ui::render(&id,root);unit_future()
 }
 fn on_card_render(_id:String)->FutureReader<()>{unit_future()}
}
export!(Plugin);

