package com.smartfind.client.net

import org.json.JSONObject

/**
 * These data classes mirror packages/protocol/src/index.ts. Kotlin can't
 * import the TypeScript package directly, so this file is the Android side
 * of a manually-synchronized contract. If you change the wire format in one
 * place, change it in both - docs/protocol.md is the source of truth for
 * the JSON shape both sides must agree on.
 */

sealed class ServerToClient {
    data class Welcome(val deviceId: String, val serverTime: Long) : ServerToClient()
    data class Command(val command: IncomingCommand) : ServerToClient()
    data class DeviceList(val raw: JSONObject) : ServerToClient()
    data class StatusUpdate(val raw: JSONObject) : ServerToClient()
    data class Error(val message: String) : ServerToClient()
}

sealed class IncomingCommand(open val requestId: String) {
    data class Ring(override val requestId: String, val target: String, val durationMs: Long) :
        IncomingCommand(requestId)
    data class StopRing(override val requestId: String, val target: String) :
        IncomingCommand(requestId)
    data class Message(override val requestId: String, val target: String, val message: String) :
        IncomingCommand(requestId)
    data class Ping(override val requestId: String) : IncomingCommand(requestId)
}

enum class CommandStatus(val wire: String) {
    SENDING("sending"),
    DELIVERED("delivered"),
    EXECUTING("executing"),
    COMPLETED("completed"),
    FAILED("failed"),
    TIMED_OUT("timed_out"),
}

object Protocol {

    fun parseServerToClient(json: String): ServerToClient? {
        val obj = JSONObject(json)
        return when (obj.optString("kind")) {
            "welcome" -> ServerToClient.Welcome(
                deviceId = obj.getString("deviceId"),
                serverTime = obj.getLong("serverTime"),
            )
            "command" -> {
                val cmd = obj.getJSONObject("command")
                val requestId = cmd.getString("requestId")
                val parsed = when (cmd.optString("type")) {
                    "RING" -> IncomingCommand.Ring(
                        requestId, cmd.getString("target"), cmd.optLong("durationMs", 30_000L)
                    )
                    "STOP_RING" -> IncomingCommand.StopRing(requestId, cmd.getString("target"))
                    "MESSAGE" -> IncomingCommand.Message(
                        requestId, cmd.getString("target"), cmd.getString("message")
                    )
                    "PING" -> IncomingCommand.Ping(requestId)
                    else -> return null
                }
                ServerToClient.Command(parsed)
            }
            "device_list" -> ServerToClient.DeviceList(obj)
            "status_update" -> ServerToClient.StatusUpdate(obj)
            "error" -> ServerToClient.Error(obj.optString("message"))
            else -> null
        }
    }

    fun hello(deviceId: String, token: String): String =
        JSONObject().apply {
            put("kind", "hello")
            put("deviceId", deviceId)
            put("token", token)
            put("deviceInfo", JSONObject())
        }.toString()

    fun ack(requestId: String, status: CommandStatus, detail: String? = null): String =
        JSONObject().apply {
            put("kind", "ack")
            put("requestId", requestId)
            put("status", status.wire)
            if (detail != null) put("detail", detail)
        }.toString()

    fun heartbeat(batteryPercent: Int?, charging: Boolean?): String =
        JSONObject().apply {
            put("kind", "heartbeat")
            if (batteryPercent != null) put("battery", batteryPercent)
            if (charging != null) put("charging", charging)
        }.toString()
}
