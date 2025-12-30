#!/usr/bin/env python3
"""
File watcher service for monitoring XML file changes.
"""

import time
import threading
from pathlib import Path
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler


class XMLFileHandler(FileSystemEventHandler):
    """Handler for XML file system events."""
    
    def __init__(self, callback):
        """
        Initialize handler with callback function.
        
        Args:
            callback: Function to call when files change
        """
        self.callback = callback
        self.last_modified = {}
    
    def on_modified(self, event):
        """Handle file modification events."""
        if event.is_directory:
            return
        
        if event.src_path.endswith('.xml'):
            # Debounce rapid file changes
            current_time = time.time()
            if event.src_path in self.last_modified:
                if current_time - self.last_modified[event.src_path] < 0.5:
                    return  # Ignore if modified within 0.5 seconds
            
            self.last_modified[event.src_path] = current_time
            print(f"XML file changed: {event.src_path}")
            self.callback(event.src_path)
    
    def on_created(self, event):
        """Handle file creation events."""
        if not event.is_directory and event.src_path.endswith('.xml'):
            print(f"New XML file created: {event.src_path}")
            self.callback(event.src_path)
    
    def on_deleted(self, event):
        """Handle file deletion events."""
        if not event.is_directory and event.src_path.endswith('.xml'):
            print(f"XML file deleted: {event.src_path}")
            self.callback(event.src_path)


class FileWatcher:
    """File watcher service."""
    
    def __init__(self, watch_directory, callback):
        """
        Initialize file watcher.
        
        Args:
            watch_directory: Directory to watch
            callback: Function to call when files change
        """
        self.watch_directory = Path(watch_directory)
        self.callback = callback
        self.observer = None
        self.running = False
    
    def start(self):
        """Start watching for file changes."""
        if self.running:
            return
        
        if not self.watch_directory.exists():
            self.watch_directory.mkdir(parents=True, exist_ok=True)
        
        event_handler = XMLFileHandler(self.callback)
        self.observer = Observer()
        self.observer.schedule(event_handler, str(self.watch_directory), recursive=False)
        self.observer.start()
        self.running = True
        print(f"File watcher started for: {self.watch_directory}")
    
    def stop(self):
        """Stop watching for file changes."""
        if self.observer:
            self.observer.stop()
            self.observer.join()
        self.running = False
        print("File watcher stopped")


def start_file_watcher(watch_directory, callback):
    """
    Start file watcher in a separate thread.
    
    Args:
        watch_directory: Directory to watch
        callback: Function to call when files change
        
    Returns:
        FileWatcher instance
    """
    watcher = FileWatcher(watch_directory, callback)
    watcher.start()
    return watcher

