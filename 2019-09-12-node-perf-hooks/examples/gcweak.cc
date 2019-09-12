#include <node.h>

struct MyStruct {
  v8::Global<v8::Object> wrapper;
};

// v8.h line 427
void MyStructCallback2(const v8::WeakCallbackInfo<MyStruct>& data) {
  printf("MyStructCallback2\n");
}

void MyStructCallback1(const v8::WeakCallbackInfo<MyStruct>& data) {
  printf("MyStructCallback1\n");
  data.GetParameter()->wrapper.Reset();
  delete data.GetParameter();
  data.SetSecondPassCallback(MyStructCallback2);
}

void Method(const v8::FunctionCallbackInfo<v8::Value>& args) {
  v8::Isolate* isolate = args.GetIsolate();
  v8::Local<v8::Context> context = isolate->GetCurrentContext();

  MyStruct* ptr = new MyStruct();
  ptr->wrapper.Reset(isolate, args.This());
  ptr->wrapper.SetWeak(ptr, MyStructCallback1, v8::WeakCallbackType::kParameter);
  v8::Local<v8::External> external = v8::External::New(isolate, ptr);

  v8::Local<v8::Object> obj = v8::Object::New(isolate);
  v8::Local<v8::String> key = v8::String::NewFromUtf8(isolate, "obj", v8::NewStringType::kNormal).ToLocalChecked();
  obj->Set(context, key, external).FromJust();
  args.GetReturnValue().Set(obj);
}

void Initialize(v8::Local<v8::Object> exports, v8::Local<v8::Value> module, void* context) {
  NODE_SET_METHOD(exports, "fn1", Method);
}

NODE_MODULE(NODE_GYP_MODULE_NAME, Initialize)
