// Created by Autokaka (qq1909698494@gmail.com) on 2023/06/20.

export const USBMUXD_SOCKET_FILE = "/var/run/usbmuxd";

export enum usbmuxd_result {
  RESULT_OK = 0,
  RESULT_BADCOMMAND = 1,
  RESULT_BADDEV = 2,
  RESULT_CONNREFUSED = 3,
  // ???
  // ???
  RESULT_BADVERSION = 6,
}

export enum usbmuxd_msgtype {
  MESSAGE_RESULT = 1,
  MESSAGE_CONNECT = 2,
  MESSAGE_LISTEN = 3,
  MESSAGE_DEVICE_ADD = 4,
  MESSAGE_DEVICE_REMOVE = 5,
  MESSAGE_DEVICE_PAIRED = 6,
  //???
  MESSAGE_PLIST = 8,
}

export interface usbmuxd_header {
  length: number; // length of message, including header
  version: number; // protocol version
  message: number; // usbmuxd_msgtype
  tag: number; // responses to this query will echo back this tag
}

export interface usbmuxd_result_msg {
  header: usbmuxd_header;
  result: number; // usbmuxd_result
}

export interface usbmuxd_connect_request {
  header: usbmuxd_header;
  device_id: number;
  port: number; // TCP port number
  reserved: number; // set to zero
}

export interface usbmuxd_listen_request {
  header: usbmuxd_header;
}

export interface usbmuxd_device_record {
  device_id: number;
  product_id: number;
  serial_number: string;
  padding: number;
  location: number;
}
