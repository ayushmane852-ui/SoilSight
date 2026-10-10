"""
SoilSight Moisture Model Training Pipeline
High-Accuracy Transfer Learning (MobileNetV2) with Data Augmentation and Two-Stage Fine-Tuning.
"""

import os
import shutil
import numpy as np
import tensorflow as tf
from tensorflow.keras import layers, models, callbacks, regularizers
from sklearn.metrics import classification_report, confusion_matrix

# Configuration
BATCH_SIZE = 32
IMG_SIZE = (224, 224)
SEED = 42

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)
DATASET_DIR = os.path.join(PROJECT_ROOT, "dataset", "Before Augmentation")
MODELS_DIR = os.path.join(PROJECT_ROOT, "models")
MODEL_SAVE_PATH = os.path.join(MODELS_DIR, "soilsight_moisture_model.keras")
LEGACY_BACKUP_PATH = os.path.join(MODELS_DIR, "soilsight_moisture_model_legacy.keras")

CLASSES = ["dry", "moderate", "wet"]


def prepare_datasets():
    print(f"Loading dataset from: {DATASET_DIR}")
    
    # We only include the 3 moisture folders
    train_ds = tf.keras.utils.image_dataset_from_directory(
        DATASET_DIR,
        labels="inferred",
        label_mode="categorical",
        class_names=CLASSES,
        color_mode="rgb",
        batch_size=BATCH_SIZE,
        image_size=IMG_SIZE,
        shuffle=True,
        seed=SEED,
        validation_split=0.2,
        subset="training"
    )

    val_test_ds = tf.keras.utils.image_dataset_from_directory(
        DATASET_DIR,
        labels="inferred",
        label_mode="categorical",
        class_names=CLASSES,
        color_mode="rgb",
        batch_size=BATCH_SIZE,
        image_size=IMG_SIZE,
        shuffle=True,
        seed=SEED,
        validation_split=0.2,
        subset="validation"
    )

    val_size = int(len(val_test_ds) * 0.6)
    val_ds = val_test_ds.take(val_size)
    test_ds = val_test_ds.skip(val_size)

    # Performance optimization
    AUTOTUNE = tf.data.AUTOTUNE
    train_ds = train_ds.cache().prefetch(buffer_size=AUTOTUNE)
    val_ds = val_ds.cache().prefetch(buffer_size=AUTOTUNE)
    test_ds = test_ds.cache().prefetch(buffer_size=AUTOTUNE)

    return train_ds, val_ds, test_ds


def build_model():
    # 1. Agricultural Data Augmentation
    data_augmentation = tf.keras.Sequential([
        layers.RandomFlip("horizontal_and_vertical"),
        layers.RandomRotation(0.12),
        layers.RandomZoom(0.12),
        layers.RandomContrast(0.12),
    ], name="data_augmentation")

    # 2. Input and Preprocessing (Normalizes 0..255 to -1..1 for MobileNetV2)
    inputs = layers.Input(shape=(IMG_SIZE[0], IMG_SIZE[1], 3), name="input_image")
    x = data_augmentation(inputs)
    x = layers.Rescaling(scale=1./127.5, offset=-1.0)(x)

    # 3. Pre-trained Base
    base_model = tf.keras.applications.MobileNetV2(
        input_shape=(IMG_SIZE[0], IMG_SIZE[1], 3),
        include_top=False,
        weights="imagenet"
    )
    base_model.trainable = False

    x = base_model(x, training=False)
    x = layers.GlobalAveragePooling2D()(x)
    x = layers.BatchNormalization()(x)
    x = layers.Dense(256, activation="relu", kernel_regularizer=regularizers.l2(1e-4))(x)
    x = layers.Dropout(0.35)(x)
    x = layers.Dense(64, activation="relu")(x)
    x = layers.Dropout(0.2)(x)
    outputs = layers.Dense(len(CLASSES), activation="softmax", name="predictions")(x)

    model = models.Model(inputs=inputs, outputs=outputs, name="SoilSight_Moisture_V2")
    return model, base_model


def train_model():
    os.makedirs(MODELS_DIR, exist_ok=True)
    if os.path.exists(MODEL_SAVE_PATH) and not os.path.exists(LEGACY_BACKUP_PATH):
        print(f"Backing up existing model to {LEGACY_BACKUP_PATH}")
        shutil.copyfile(MODEL_SAVE_PATH, LEGACY_BACKUP_PATH)

    train_ds, val_ds, test_ds = prepare_datasets()
    model, base_model = build_model()

    print("\n--- STAGE 1: Training Classification Head ---")
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=1e-3),
        loss="categorical_crossentropy",
        metrics=["accuracy"]
    )

    stage1_callbacks = [
        callbacks.EarlyStopping(monitor="val_loss", patience=4, restore_best_weights=True)
    ]

    history1 = model.fit(
        train_ds,
        validation_data=val_ds,
        epochs=12,
        callbacks=stage1_callbacks,
        verbose=1
    )

    print("\n--- STAGE 2: Deep Fine-Tuning Top MobileNetV2 Layers ---")
    base_model.trainable = True
    # Freeze lower layers, unfreeze top 40 layers
    fine_tune_at = len(base_model.layers) - 40
    for layer in base_model.layers[:fine_tune_at]:
        layer.trainable = False

    print(f"Base model unfreezed from layer {fine_tune_at} of {len(base_model.layers)}")

    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=1e-5),
        loss="categorical_crossentropy",
        metrics=["accuracy"]
    )

    stage2_callbacks = [
        callbacks.EarlyStopping(monitor="val_loss", patience=5, restore_best_weights=True),
        callbacks.ReduceLROnPlateau(monitor="val_loss", factor=0.5, patience=2, min_lr=1e-7, verbose=1)
    ]

    history2 = model.fit(
        train_ds,
        validation_data=val_ds,
        epochs=18,
        callbacks=stage2_callbacks,
        verbose=1
    )

    print("\n--- EVALUATION ON TEST SET ---")
    test_loss, test_acc = model.evaluate(test_ds, verbose=1)
    print(f"--> Test Loss: {test_loss:.4f}, Test Accuracy: {test_acc * 100:.2f}%")

    # Save the retrained high accuracy model
    print(f"\nSaving model to: {MODEL_SAVE_PATH}")
    model.save(MODEL_SAVE_PATH)
    print("Model successfully saved!")

    # Confusion matrix & classification report
    y_true = []
    y_pred = []
    for x_batch, y_batch in test_ds:
        preds = model.predict(x_batch, verbose=0)
        y_true.extend(np.argmax(y_batch.numpy(), axis=1))
        y_pred.extend(np.argmax(preds, axis=1))

    print("\nClassification Report:")
    print(classification_report(y_true, y_pred, target_names=CLASSES, zero_division=0))

    return model, test_acc


if __name__ == "__main__":
    train_model()
